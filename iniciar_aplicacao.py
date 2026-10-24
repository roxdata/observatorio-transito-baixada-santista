import uvicorn
import sys
import os

if __name__ == "__main__":
    print("="*70)
    print("INICIANDO APLICAÇÃO WEB ANALÍTICA & IA - PROJETO INTEGRADOR II")
    print("Região Metropolitana da Baixada Santista (2022–2025)")
    print("="*70)
    print("\n[OK] Backend: FastAPI + DuckDB OLAP")
    print("[OK] Frontend: Dashboard Glassmorphism + Mapas GIS Leaflet + Chart.js")
    print("[OK] IA: Assistente Analitico Integrado com Economia de Tokens")
    print("\nServidor disponível no navegador em: http://127.0.0.1:8000")
    print("Pressione Ctrl+C no terminal para encerrar o servidor a qualquer momento.\n")
    
    # Executa o servidor na porta 8000
    uvicorn.run("app_web.main:app", host="127.0.0.1", port=8000, reload=False)
