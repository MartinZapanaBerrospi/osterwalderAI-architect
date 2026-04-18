"""
OsterwalderAI Architect — Consultor de Negocios Inteligente (100% Offline)
Curso: Sistemas Analíticos (UNI) - 2026-I

Backend principal: FastAPI + LangChain RAG + GPT4All + ChromaDB
"""

import os
import sys
import threading
import uvicorn
import re
import json
import shutil
import traceback
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ══════════════════════════════════════════════════════════════
# CONFIGURACIÓN DE RUTAS
# ══════════════════════════════════════════════════════════════

def get_base_path():
    """Obtiene la ruta base (compatible con PyInstaller)."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()
MODELS_DIR = os.path.join(BASE_PATH, "models")
KNOWLEDGE_DIR = os.path.join(BASE_PATH, "knowledge_base")
UPLOADS_DIR = os.path.join(BASE_PATH, "uploads")
CHROMA_DIR = os.path.join(os.getcwd(), "chroma_db")
EXPORTS_DIR = os.path.join(BASE_PATH, "exports")
STATIC_DIR = os.path.join(BASE_PATH, "static")

# Crear directorios necesarios
for _dir in [MODELS_DIR, KNOWLEDGE_DIR, UPLOADS_DIR, CHROMA_DIR, EXPORTS_DIR]:
    os.makedirs(_dir, exist_ok=True)

# Nombres de modelos .gguf
LLM_MODEL_NAME = "Llama-3.2-1B-Instruct-Q4_0.gguf"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2.gguf2.f16.gguf"

# ══════════════════════════════════════════════════════════════
# ESTADO GLOBAL DEL SISTEMA
# ══════════════════════════════════════════════════════════════

system_status = {
    "state": "starting",
    "message": "Iniciando sistema...",
    "progress": 0
}

rag_chain = None
vectorstore = None
llm_instance = None
retriever = None
embeddings = None

# ══════════════════════════════════════════════════════════════
# UTILIDADES
# ══════════════════════════════════════════════════════════════

def log(msg):
    """Log con timestamp (compatible con cp1252 de Windows)."""
    safe_msg = str(msg).encode('ascii', 'replace').decode('ascii')
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {safe_msg}", flush=True)

def update_status(state: str, message: str, progress: int = 0):
    """Actualiza el estado del sistema."""
    global system_status
    system_status = {"state": state, "message": message, "progress": progress}
    log(f"[STATUS] {state}: {message} ({progress}%)")

# ══════════════════════════════════════════════════════════════
# PROMPTS ESPECIALIZADOS PARA MODELOS DE NEGOCIO
# ══════════════════════════════════════════════════════════════

MODEL_PROMPTS = {
    "bmc": {
        "title": "Business Model Canvas",
        "query": "modelo de negocio clientes propuesta de valor canales ingresos recursos actividades asociaciones costos",
        "blocks": [
            "SEGMENTOS_CLIENTES", "PROPUESTA_VALOR", "CANALES",
            "RELACIONES_CLIENTES", "FUENTES_INGRESOS", "RECURSOS_CLAVE",
            "ACTIVIDADES_CLAVE", "ASOCIACIONES_CLAVE", "ESTRUCTURA_COSTOS"
        ],
        "prompt_template": (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            "Eres un consultor de negocios experto en Business Model Canvas de Osterwalder. "
            "Analiza negocios y genera los 9 bloques del Canvas."
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            "Analiza este negocio y genera el Business Model Canvas.\n"
            "Responde SOLO con estos 9 bloques. Para cada bloque escribe 2-3 puntos cortos:\n\n"
            "[SEGMENTOS_CLIENTES]\n[PROPUESTA_VALOR]\n[CANALES]\n"
            "[RELACIONES_CLIENTES]\n[FUENTES_INGRESOS]\n[RECURSOS_CLAVE]\n"
            "[ACTIVIDADES_CLAVE]\n[ASOCIACIONES_CLAVE]\n[ESTRUCTURA_COSTOS]\n\n"
            "Documento:\n{context}"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    },
    "empathy": {
        "title": "Mapa de Empatía",
        "query": "cliente usuario emociones problemas necesidades frustraciones motivaciones entorno",
        "blocks": [
            "PIENSA_SIENTE", "VE", "OYE", "DICE_HACE", "ESFUERZOS", "RESULTADOS"
        ],
        "prompt_template": (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            "Eres un consultor de negocios experto en Mapas de Empatía. "
            "Analiza negocios para comprender profundamente al cliente."
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            "Genera un Mapa de Empatía del cliente principal de este negocio.\n"
            "Responde SOLO con estos 6 bloques. Para cada bloque escribe 2-3 puntos:\n\n"
            "[PIENSA_SIENTE]\n[VE]\n[OYE]\n[DICE_HACE]\n[ESFUERZOS]\n[RESULTADOS]\n\n"
            "Documento:\n{context}"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    },
    "persona": {
        "title": "Mapa de Persona / Cliente",
        "query": "perfil cliente ideal demografía edad comportamiento hábitos necesidades objetivos",
        "blocks": [
            "NOMBRE_PERFIL", "DEMOGRAFIA", "COMPORTAMIENTO",
            "NECESIDADES", "FRUSTRACIONES", "MOTIVACIONES"
        ],
        "prompt_template": (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            "Eres un consultor de negocios experto en Buyer Personas. "
            "Creas perfiles detallados de clientes ideales."
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            "Genera un Mapa de Persona/Cliente ideal para este negocio.\n"
            "Responde SOLO con estos 6 bloques. Para cada bloque escribe 2-3 puntos:\n\n"
            "[NOMBRE_PERFIL]\n[DEMOGRAFIA]\n[COMPORTAMIENTO]\n"
            "[NECESIDADES]\n[FRUSTRACIONES]\n[MOTIVACIONES]\n\n"
            "Documento:\n{context}"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    },
    "value": {
        "title": "Lienzo de Propuesta de Valor",
        "query": "propuesta de valor productos servicios beneficio dolor ganancia problema solución",
        "blocks": [
            "TRABAJOS_CLIENTE", "DOLORES", "GANANCIAS",
            "PRODUCTOS_SERVICIOS", "ALIVIADORES_DOLOR", "CREADORES_GANANCIA"
        ],
        "prompt_template": (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            "Eres un consultor de negocios experto en el Value Proposition Canvas de Osterwalder. "
            "Diseñas propuestas de valor que se alinean con las necesidades del cliente."
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            "Genera un Lienzo de Propuesta de Valor para este negocio.\n"
            "Responde SOLO con estos 6 bloques. Para cada bloque escribe 2-3 puntos:\n\n"
            "[TRABAJOS_CLIENTE]\n[DOLORES]\n[GANANCIAS]\n"
            "[PRODUCTOS_SERVICIOS]\n[ALIVIADORES_DOLOR]\n[CREADORES_GANANCIA]\n\n"
            "Documento:\n{context}"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    },
    "journey": {
        "title": "Customer Journey Map",
        "query": "experiencia cliente viaje antes durante después compra descubrimiento uso retención recomendación",
        "blocks": [
            "DESCUBRIMIENTO", "CONSIDERACION", "DECISION",
            "COMPRA", "USO", "SOPORTE", "RETENCION", "RECOMENDACION"
        ],
        "prompt_template": (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            "Eres un consultor de negocios experto en Customer Journey Maps. "
            "Mapeas la experiencia completa del cliente en 3 fases: Antes, Durante y Después."
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            "Genera un Customer Journey Map para este negocio.\n"
            "Responde SOLO con estos 8 bloques (Antes/Durante/Después). "
            "Para cada bloque escribe 2-3 puntos:\n\n"
            "ANTES:\n[DESCUBRIMIENTO]\n[CONSIDERACION]\n[DECISION]\n"
            "DURANTE:\n[COMPRA]\n[USO]\n"
            "DESPUÉS:\n[SOPORTE]\n[RETENCION]\n[RECOMENDACION]\n\n"
            "Documento:\n{context}"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        )
    }
}

COMPARE_PROMPT = (
    "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
    "Eres un evaluador de negocios experto. Emites juicios de factibilidad "
    "técnica y comercial comparando dos propuestas."
    "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
    "Compara estas dos propuestas de modelo de negocio y emite un juicio de factibilidad.\n\n"
    "PROPUESTA ORIGINAL (de la tesis):\n{original}\n\n"
    "PROPUESTA IA (generada por inteligencia artificial):\n{ai_proposal}\n\n"
    "Responde con:\n"
    "[COINCIDENCIAS] puntos donde ambas coinciden\n"
    "[DIFERENCIAS] puntos donde difieren\n"
    "[FACTIBILIDAD_TECNICA] evaluación técnica (Alta/Media/Baja + justificación)\n"
    "[FACTIBILIDAD_COMERCIAL] evaluación comercial (Alta/Media/Baja + justificación)\n"
    "[RECOMENDACIONES] mejoras sugeridas\n"
    "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
)

CHAT_PROMPT = (
    "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
    "Eres OsterwalderAI, un Consultor de Negocios de IA especializado en "
    "modelos de Osterwalder. Respondes en español de forma concisa y profesional.\n"
    "Usa tu conocimiento general y el siguiente contexto como apoyo.\n\n"
    "Contexto:\n{context}"
    "<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
    "{input}"
    "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
)

# ══════════════════════════════════════════════════════════════
# INICIALIZACIÓN DEL SISTEMA RAG
# ══════════════════════════════════════════════════════════════

def initialize_rag():
    """Inicializa el pipeline RAG completo: descarga de modelos, embeddings, ChromaDB y LLM."""
    global rag_chain, vectorstore, llm_instance, retriever, embeddings

    try:
        # ─── Paso 1: Descargar modelos si no existen ───
        update_status("downloading_models", "Verificando modelos de IA...", 5)

        from gpt4all import GPT4All as NativeGPT4All

        llm_path = os.path.join(MODELS_DIR, LLM_MODEL_NAME)
        embed_path = os.path.join(MODELS_DIR, EMBED_MODEL_NAME)

        if not os.path.exists(llm_path):
            update_status("downloading_models", f"Descargando {LLM_MODEL_NAME}...", 10)
            NativeGPT4All.download_model(LLM_MODEL_NAME, model_path=MODELS_DIR)
            log(f"[RAG] Modelo LLM descargado: {LLM_MODEL_NAME}")

        if not os.path.exists(embed_path):
            update_status("downloading_models", f"Descargando {EMBED_MODEL_NAME}...", 25)
            NativeGPT4All.download_model(EMBED_MODEL_NAME, model_path=MODELS_DIR)
            log(f"[RAG] Modelo Embedding descargado: {EMBED_MODEL_NAME}")

        update_status("downloading_models", "Modelos verificados OK", 30)

        # ─── Paso 2: Cargar Embeddings ───
        update_status("loading_embeddings", "Cargando modelo de embeddings...", 35)

        from langchain_community.embeddings import GPT4AllEmbeddings
        embeddings = GPT4AllEmbeddings(
            model_name=EMBED_MODEL_NAME,
            gpt4all_kwargs={'allow_download': False, 'model_path': MODELS_DIR}
        )
        log("[RAG] Embeddings cargados correctamente.")

        # ─── Paso 3: Indexar Knowledge Base ───
        update_status("indexing_knowledge", "Indexando base de conocimiento...", 45)

        from langchain_chroma import Chroma
        from langchain_community.document_loaders import PyPDFDirectoryLoader
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        # Verificar si ya existe una base de datos indexada
        chroma_has_data = os.path.exists(CHROMA_DIR) and any(
            f.endswith('.sqlite3') or f.endswith('.bin')
            for f in os.listdir(CHROMA_DIR) if os.path.isfile(os.path.join(CHROMA_DIR, f))
        )

        if chroma_has_data:
            log("[RAG] Base de datos ChromaDB existente encontrada. Cargando...")
            vectorstore = Chroma(
                persist_directory=CHROMA_DIR,
                embedding_function=embeddings
            )
            update_status("indexing_knowledge", "Base de conocimiento cargada OK", 65)
        else:
            # Buscar PDFs en knowledge_base/ y también en la raíz del proyecto
            all_docs = []

            # Indexar knowledge_base/
            if os.listdir(KNOWLEDGE_DIR):
                log(f"[RAG] Indexando PDFs de knowledge_base/...")
                kb_loader = PyPDFDirectoryLoader(KNOWLEDGE_DIR)
                all_docs.extend(kb_loader.load())

            # Indexar PDFs de la raíz del proyecto (libros de Osterwalder)
            root_pdfs = [f for f in os.listdir(BASE_PATH) if f.endswith('.pdf')]
            if root_pdfs:
                log(f"[RAG] Indexando {len(root_pdfs)} PDFs de la raíz del proyecto...")
                from langchain_community.document_loaders import PyPDFLoader
                for pdf_name in root_pdfs:
                    try:
                        pdf_path = os.path.join(BASE_PATH, pdf_name)
                        loader = PyPDFLoader(pdf_path)
                        all_docs.extend(loader.load())
                        log(f"  > {pdf_name} procesado.")
                    except Exception as e:
                        log(f"  X Error procesando {pdf_name}: {e}")

            if all_docs:
                log(f"[RAG] Fragmentando {len(all_docs)} páginas...")
                text_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=1000,
                    chunk_overlap=200,
                    separators=["\n\n", "\n", ". ", " ", ""]
                )
                fragments = text_splitter.split_documents(all_docs)
                log(f"[RAG] Creando base vectorial con {len(fragments)} fragmentos...")

                vectorstore = Chroma.from_documents(
                    documents=fragments,
                    embedding=embeddings,
                    persist_directory=CHROMA_DIR
                )
                update_status("indexing_knowledge", f"Indexados {len(fragments)} fragmentos OK", 65)
            else:
                log("[RAG] No se encontraron PDFs. Creando base vacía...")
                vectorstore = Chroma.from_texts(
                    texts=["OsterwalderAI Architect - Sistema de consultoría de negocios con IA."],
                    embedding=embeddings,
                    persist_directory=CHROMA_DIR
                )
                update_status("indexing_knowledge", "Base vacía creada (sube PDFs para empezar)", 65)

        retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

        # ─── Paso 4: Cargar Modelo de Lenguaje (LLM) ───
        update_status("loading_llm", "Cargando modelo de lenguaje...", 75)

        from langchain_community.llms import GPT4All
        llm_instance = GPT4All(
            model=os.path.join(MODELS_DIR, LLM_MODEL_NAME),
            max_tokens=2048,
            n_predict=2048,
            temp=0.4,
            repeat_penalty=1.18,
            stop=["<|eot_id|>", "<|reserved_special_token"]
        )
        log("[RAG] Modelo de lenguaje cargado correctamente.")

        # ─── SISTEMA LISTO ───
        update_status("ready", "Sistema listo para consultas!", 100)

    except Exception as e:
        error_msg = str(e)
        log(f"[ERROR CRITICO] {error_msg}")
        traceback.print_exc()
        update_status("error", f"Error: {error_msg}", 0)

# ══════════════════════════════════════════════════════════════
# UTILIDADES RAG
# ══════════════════════════════════════════════════════════════

def retrieve_context(query: str, k: int = 4) -> str:
    """Recupera contexto relevante de la base vectorial."""
    if retriever is None:
        return ""
    try:
        docs = retriever.invoke(query)
        return "\n\n".join([doc.page_content for doc in docs[:k]])
    except Exception:
        return ""

def invoke_llm(prompt: str) -> str:
    """Invoca el LLM con un prompt y limpia la respuesta."""
    if llm_instance is None:
        return "Error: El modelo de lenguaje no está disponible."
    try:
        response = llm_instance.invoke(prompt)
        # Limpiar tokens especiales de Llama 3
        clean = re.sub(r"<\|.*?\|>", "", response).strip()
        return clean
    except Exception as e:
        return f"Error durante la inferencia: {str(e)}"

def parse_blocks(response_text: str, expected_blocks: list) -> Dict[str, List[str]]:
    """Parsea la respuesta del LLM en bloques etiquetados."""
    blocks = {}
    for block_name in expected_blocks:
        # Buscar el bloque con formato [BLOCK_NAME]
        pattern = rf'\[{block_name}\]\s*(.*?)(?=\[(?:{"|".join(expected_blocks)})\]|\Z)'
        match = re.search(pattern, response_text, re.DOTALL | re.IGNORECASE)
        if match:
            content = match.group(1).strip()
            items = []
            for line in content.split('\n'):
                line = line.strip()
                # Limpiar viñetas y marcadores
                line = re.sub(r'^[-•*]\s*', '', line)
                line = re.sub(r'^\d+\.\s*', '', line)
                if line and len(line) > 2:
                    items.append(line)
            blocks[block_name] = items if items else ["(Información no disponible)"]
        else:
            blocks[block_name] = ["(Información no disponible)"]
    return blocks

# ══════════════════════════════════════════════════════════════
# GENERACIÓN DE PDF CON fpdf2
# ══════════════════════════════════════════════════════════════

def generate_pdf_report(title: str, sections: list) -> str:
    """Genera un reporte PDF profesional con fpdf2."""
    from fpdf import FPDF

    class ReportPDF(FPDF):
        def header(self):
            self.set_font('Helvetica', 'B', 11)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, 'OsterwalderAI Architect | Consultoría de Negocios con IA', 0, 1, 'C')
            self.set_draw_color(0, 180, 220)
            self.set_line_width(0.5)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)

        def footer(self):
            self.set_y(-15)
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f'Página {self.page_no()}/{{nb}} | Generado: {datetime.now().strftime("%d/%m/%Y %H:%M")}', 0, 0, 'C')

    pdf = ReportPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ─── Portada ───
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font('Helvetica', 'B', 28)
    pdf.set_text_color(0, 180, 220)
    pdf.cell(0, 15, 'OsterwalderAI Architect', 0, 1, 'C')
    pdf.ln(5)
    pdf.set_font('Helvetica', '', 16)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, 'Consultoría de Negocios con Inteligencia Artificial', 0, 1, 'C')
    pdf.ln(15)
    pdf.set_font('Helvetica', 'B', 18)
    pdf.set_text_color(40, 40, 40)
    # Manejar caracteres especiales en el título
    safe_title = title.encode('latin-1', 'replace').decode('latin-1')
    pdf.multi_cell(0, 12, safe_title, 0, 'C')
    pdf.ln(20)
    pdf.set_font('Helvetica', '', 12)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 8, f'Fecha: {datetime.now().strftime("%d de %B de %Y")}', 0, 1, 'C')
    pdf.cell(0, 8, 'Curso: Sistemas Analiticos (UNI) - 2026-I', 0, 1, 'C')

    # ─── Secciones de contenido ───
    for section in sections:
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(0, 150, 200)
        section_title = section.get('title', 'Sin título')
        safe_section_title = section_title.encode('latin-1', 'replace').decode('latin-1')
        pdf.cell(0, 12, safe_section_title, 0, 1, 'L')
        pdf.set_draw_color(0, 180, 220)
        pdf.line(10, pdf.get_y(), 120, pdf.get_y())
        pdf.ln(8)

        content = section.get('content', '')
        pdf.set_font('Helvetica', '', 11)
        pdf.set_text_color(50, 50, 50)
        safe_content = content.encode('latin-1', 'replace').decode('latin-1')
        pdf.multi_cell(0, 7, safe_content)

    # Guardar
    filename = f"reporte_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)
    pdf.output(filepath)
    log(f"[PDF] Reporte generado: {filepath}")
    return filepath

# ══════════════════════════════════════════════════════════════
# FASTAPI — SERVIDOR PRINCIPAL
# ══════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida del servidor: inicializa RAG al arrancar."""
    threading.Thread(target=initialize_rag, daemon=True).start()
    yield

app = FastAPI(
    title="OsterwalderAI Architect",
    description="Consultor de Negocios Inteligente 100% Offline",
    version="1.0.0",
    lifespan=lifespan
)

# ══════════════════════════════════════════════════════════════
# MODELOS DE DATOS (Pydantic)
# ══════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    query: str

class GenerateModelRequest(BaseModel):
    model_type: str  # bmc, empathy, persona, value, journey

class CompareRequest(BaseModel):
    original_summary: str
    ai_analysis: str

class ExportPDFRequest(BaseModel):
    title: str
    sections: List[Dict[str, str]]

# ══════════════════════════════════════════════════════════════
# ENDPOINTS API
# ══════════════════════════════════════════════════════════════

@app.get("/api/status")
def get_status():
    """Retorna el estado actual del sistema."""
    return system_status

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    """Chat libre con la IA usando RAG."""
    if llm_instance is None:
        return {"error": "El sistema aún se está inicializando. Por favor, espera unos momentos."}

    try:
        context = retrieve_context(req.query)
        prompt = CHAT_PROMPT.format(context=context, input=req.query)
        answer = invoke_llm(prompt)
        return {"answer": answer}
    except Exception as e:
        return {"error": f"Error durante la consulta: {str(e)}"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Sube un PDF y lo indexa en la base de conocimiento."""
    global vectorstore

    if vectorstore is None or embeddings is None:
        return {"error": "El sistema se está inicializando, espera un momento."}

    if not file.filename.lower().endswith(".pdf"):
        return {"error": "Solo se permiten archivos PDF."}

    try:
        # Guardar archivo
        file_location = os.path.join(UPLOADS_DIR, file.filename)
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Indexar en ChromaDB
        from langchain_community.document_loaders import PyPDFLoader
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        loader = PyPDFLoader(file_location)
        new_docs = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=200
        )
        fragments = text_splitter.split_documents(new_docs)
        vectorstore.add_documents(fragments)

        log(f"[UPLOAD] PDF '{file.filename}' indexado: {len(fragments)} fragmentos")
        return {
            "message": f"PDF '{file.filename}' agregado exitosamente.",
            "pages": len(new_docs),
            "fragments": len(fragments),
            "filename": file.filename
        }
    except Exception as e:
        return {"error": f"Error al procesar el PDF: {str(e)}"}

@app.post("/api/generate-model")
def generate_model(req: GenerateModelRequest):
    """Genera un modelo de negocio específico usando RAG."""
    if llm_instance is None:
        return {"error": "El sistema aún se está inicializando."}

    model_type = req.model_type.lower()
    if model_type not in MODEL_PROMPTS:
        return {"error": f"Tipo de modelo no válido. Opciones: {list(MODEL_PROMPTS.keys())}"}

    try:
        config = MODEL_PROMPTS[model_type]

        # Recuperar contexto relevante
        context = retrieve_context(config["query"], k=4)
        if not context.strip():
            return {"error": "No hay documentos en la base de conocimiento. Sube un PDF primero."}

        # Generar con el LLM
        prompt = config["prompt_template"].format(context=context[:2000])
        raw_response = invoke_llm(prompt)

        # Parsear bloques
        blocks = parse_blocks(raw_response, config["blocks"])

        return {
            "model_type": model_type,
            "title": config["title"],
            "blocks": blocks,
            "raw_response": raw_response
        }
    except Exception as e:
        return {"error": f"Error generando {model_type}: {str(e)}"}

@app.post("/api/compare")
def compare_proposals(req: CompareRequest):
    """Compara propuesta IA vs propuesta original de la tesis."""
    if llm_instance is None:
        return {"error": "El sistema aún se está inicializando."}

    try:
        prompt = COMPARE_PROMPT.format(
            original=req.original_summary[:1500],
            ai_proposal=req.ai_analysis[:1500]
        )
        raw_response = invoke_llm(prompt)

        compare_blocks = [
            "COINCIDENCIAS", "DIFERENCIAS",
            "FACTIBILIDAD_TECNICA", "FACTIBILIDAD_COMERCIAL",
            "RECOMENDACIONES"
        ]
        blocks = parse_blocks(raw_response, compare_blocks)

        return {
            "comparison": blocks,
            "raw_response": raw_response
        }
    except Exception as e:
        return {"error": f"Error en la comparación: {str(e)}"}

@app.post("/api/export-pdf")
def export_pdf(req: ExportPDFRequest):
    """Genera y retorna un PDF con los resultados del análisis."""
    try:
        filepath = generate_pdf_report(req.title, req.sections)
        return FileResponse(
            filepath,
            media_type="application/pdf",
            filename=os.path.basename(filepath)
        )
    except Exception as e:
        return {"error": f"Error generando PDF: {str(e)}"}

# ══════════════════════════════════════════════════════════════
# ARCHIVOS ESTÁTICOS E INTERFAZ WEB
# ══════════════════════════════════════════════════════════════

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    """Sirve la interfaz web principal."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# ══════════════════════════════════════════════════════════════
# LANZADOR PRINCIPAL
# ══════════════════════════════════════════════════════════════

def run_server():
    """Ejecuta el servidor FastAPI con Uvicorn."""
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

if __name__ == '__main__':
    log("=" * 55)
    log("  OsterwalderAI Architect -- Iniciando...")
    log("  Curso: Sistemas Analiticos (UNI) - 2026-I")
    log("=" * 55)

    # Iniciar FastAPI en hilo separado
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Lanzar ventana nativa con pywebview
    import webview
    window = webview.create_window(
        'OsterwalderAI Architect',
        'http://127.0.0.1:8000',
        width=1280,
        height=860,
        min_size=(900, 600),
        text_select=True
    )
    webview.start()
