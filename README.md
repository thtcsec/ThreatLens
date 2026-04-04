# <p align="center">🛡️ ThreatLens - AI Security Copilot</p>

<p align="center">
  <img src="https://img.shields.io/badge/Team-QuantumBug-green?style=for-the-badge" alt="Team">
  <img src="https://img.shields.io/badge/Competition-GDGOC%20SAU-blue?style=for-the-badge" alt="Hackathon">
  <img src="https://img.shields.io/badge/Award-2nd%20Runner%20Up-orange?style=for-the-badge" alt="Award">
  <img src="https://img.shields.io/badge/Powered%20By-Google%20Gemini-vibrant?style=for-the-badge" alt="AI Model">
  <img src="https://img.shields.io/badge/Tech-Next.js%20|%20FastAPI-black?style=for-the-badge" alt="Stack">
</p>

---

## 🌟 Tầm nhìn dự án
**ThreatLens** là hệ sinh thái AI đồng hành bảo mật thông minh, thiết kế bởi **QuantumBug Team** cho khuôn khổ **GDGOC (Study Jams)**. Bằng việc ứng dụng sức mạnh của **Generative AI (Gemini 3)**, ThreatLens giúp Developer phát hiện sớm lỗ hổng bảo mật ngay trong quá trình Code, tự động phân tích và đưa ra giải pháp (Self-healing recommendations).

## 🚀 Tính năng nổi bật ("Killer Features")
- **🕵️‍♂️ IDE-Style Code Scanner (Tích hợp RAG & Gemini):** Trình Editor phân tích tĩnh mã nguồn Full-width hỗ trợ đa ngôn ngữ (JS, Python, Go, C++, SQL). Data truyền thẳng tới Gemini Backend để chẩn đoán OWASP Top 10 vulnerabilities realtime.
- **💬 Security Persona Chatbot:** Vận dụng kĩ thuật **Prompt Engineering (Few-shot, Chain-of-Thought)** ẩn bên dưới giao diện để tạo ra một "Chuyên gia bảo mật" ảo, chẩn đoán lỗi cực kì bám sát thực tế.
- **📊 Premium Risk Dashboard:** Giao diện Enterprise Dark Mode tự động cập nhật số liệu và xu hướng rủi ro từ hệ thống Vector DB (ChromaDB/Pinecone).

## 🎯 Alignment với GDGOC Objectives
- Khai thác tận gốc **Generative AI & Google Technologies (Gemini API)** để giải quyết bài toán cốt lõi trong ngành An Toàn Thông Tin.
- Phát triển tư duy "AI Engineering mindset": Chú trọng định cấu hình parameter, vector context (RAG) thay vì gọi API thô giản.
- Kiến trúc Microservices (Next.js Front-end tách biệt FastAPI Backend) hoàn toàn sẵn sàng deploy lên môi trường doanh nghiệp Cloud.

## 🏗️ Kiến trúc Công Nghệ
- **Front-end:** Next.js 14, React 18, PrismJS (Syntax Highlighting).
- **Back-end:** FastAPI (Python), uvicorn.
- **AI & RAG:** Google Gemini Embedding/LLM models, Vector Database (ChromaDB / Pinecone).

---

### 📥 Hướng dẫn khởi chạy (Development)

**Cách 1: Khởi chạy bằng Docker (Dễ nhất cho Dev)**
\`\`\`bash
docker-compose up --build
\`\`\`

**Cách 2: Chạy thủ công từng node (Recommended cho Demo Live)**
\`\`\`bash
# Terminal 1: Khởi chạy Backend FastAPI (Cổng 8000)
cd backend
.venv\\Scripts\\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Khởi chạy Frontend Next.js (Cổng 3000)
cd frontend
npm install
npm run dev
\`\`\`

<p align="center"><i>🏆 <b>Giải Ba (2nd Runner Up) - GDGOC SAU 2026</b>. Phát triển bởi team <b>QuantumBug</b> (Hoàng Tú & Tấn Thắng) - Trường Đại học Sài Gòn.</i></p>
