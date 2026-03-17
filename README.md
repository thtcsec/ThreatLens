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

<p align="center"><i>Phát triển bởi team QuantumBug cho cuộc thi GDGOC tại Đại học Sài Gòn.</i></p>
