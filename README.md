# <p align="center">🛡️ ThreatLens - AI Security Copilot</p>

<p align="center">
  <img src="https://img.shields.io/badge/Team-QuantumBug-green?style=for-the-badge" alt="Team">
  <img src="https://img.shields.io/badge/GDGOC-SAU-blue?style=for-the-badge" alt="College">
  <img src="https://img.shields.io/badge/AI-Gemini%203-vibrant?style=for-the-badge" alt="AI Model">
</p>

---

## 🌟 Tầm nhìn dự án
**ThreatLens** là người đồng hành bảo mật thông minh, được thiết kế bởi team **QuantumBug**. Chúng tôi kết hợp kiến thức chuyên sâu về **An toàn thông tin** (HUFLIT) và khả năng **Khoa học máy tính** (HCMUS) để tạo ra một hệ thống phòng thủ AI tối ưu cho lập trình viên.

## 🚀 Tính năng
- **🔍 Secure Code Analytics**: Quét mã nguồn thời gian thực, phát hiện SQLi, XSS, Broken Auth (OWASP Top 10).
- **🎣 Phishing Guardian**: Phân tích URL và email lừa đảo với độ xác cao.
- **📚 Intelligent RAG**: Truy xuất tri thức từ kho dữ liệu CVE, CWE và tiêu chuẩn OWASP mới nhất.
- **💬 Security Persona**: Trò chuyện với AI dưới vai trò "Cybersecurity Analyst" chuyên nghiệp.

## 🏗️ Kiến trúc hệ thống
- **Presentation Layer**: [Next.js](frontend/) - Giao diện Dashboard cao cấp & Chatbot.
- **Intelligence Service**: [FastAPI](backend/) - AI Engine điều phối luồng RAG.
- **Knowledge Base**: Vector DB (Pinecone/ChromaDB) - Lưu trữ tri thức bảo mật.

## 👥 Đội ngũ phát triển (QuantumBug Team)
| Tên | Vai trò | Chuyên môn |
| :--- | :--- | :--- |
| **Trịnh Hoàng Tú (thtcsec)** | **Leader & Security Architect** | Security @ HUFLIT - AI Logic, Research, Prompt Design |
| **Nguyễn Tấn Thắng (thangak18)** | **Core Developer** | Computer Science @ HCMUS - Full-stack & Infrastructure |

## 🛠️ Lộ trình (Roadmap)
- [ ] **Phase 1**: Project Framework & Skeleton Setup.
- [ ] **Phase 2**: RAG Implementation & Gemini Integration.
- [ ] **Phase 3**: UI Refinement & Dashboards.

---

### 📥 Starting Guide

#### Cách 1: Chạy trực tiếp (Recommend for Dev)
```bash
# Backend
cd backend ; .venv\Scripts\activate ; pip install -r requirements.txt ; python main.py

# Frontend
cd frontend ; npm install ; npm run dev
```

#### Cách 2: Chạy bằng Docker (Fast & Uniform)
```bash
docker-compose up --build
```

### 🗄️ Cấu hình Vector DB + Retrieval

#### 1) Chọn provider Vector DB
Project hỗ trợ 2 cách:

- **Pinecone (cloud)**: dùng cho production/staging.
- **ChromaDB (local)**: dùng cho dev/test nhanh trên máy cá nhân.

Các biến môi trường chính trong `.env`:

```bash
# Chọn provider: pinecone | chroma
VECTOR_DB_PROVIDER=pinecone

# Dùng cho Pinecone
VECTOR_DB_API_KEY=your_pinecone_key
VECTOR_DB_INDEX=your_pinecone_index
VECTOR_DB_NAMESPACE=default
PINECONE_ENVIRONMENT=your_environment_if_needed
PINECONE_HOST=

# Dùng cho Chroma local
CHROMA_DB_PATH=./.chroma
CHROMA_COLLECTION=threatlens_knowledge

# Embedding model (bắt buộc)
GEMINI_API_KEY=your_gemini_key
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSION=768
```

#### 2) Nạp dữ liệu vào Vector DB (Ingestion)

Bạn có thể dùng file mẫu:

```bash
cd backend
python scripts/ingest_knowledge.py --file data/sample_security_events.json
```

Định dạng JSON hỗ trợ:

- `[{...}, {...}]`
- `{"events": [{...}, {...}]}`

Mỗi event cần tối thiểu trường `content`. Các trường gợi ý:
`id`, `category`, `severity`, `project`, `source`, `timestamp`.

#### 3) Truy xuất dữ liệu (Retrieval)

Chạy truy vấn từ terminal:

```bash
cd backend
python scripts/query_knowledge.py --query "sql injection at login endpoint" --top-k 5
```

Lọc theo project:

```bash
python scripts/query_knowledge.py --query "jwt secret leak" --project auth-api --top-k 3
```

Hoặc trả về JSON:

```bash
python scripts/query_knowledge.py --query "rate limiting issue" --json
```

#### 4) API Retrieval (FastAPI)

Nạp dữ liệu qua API:

```bash
curl -X POST http://localhost:8000/api/v1/knowledge/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "content": "Unsanitized input in search endpoint can cause XSS",
        "category": "Injection",
        "severity": "high",
        "project": "portal-web",
        "source": "manual-review"
      }
    ]
  }'
```

Truy xuất qua API:

```bash
curl -X POST http://localhost:8000/api/v1/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "xss in search endpoint",
    "topK": 5,
    "project": "portal-web"
  }'
```

<p align="center"><i>Phát triển bởi team QuantumBug cho cuộc thi GDGOC tại Đại học Sài Gòn.</i></p>
