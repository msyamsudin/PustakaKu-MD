# PustakaKu-MD

PustakaKu-MD adalah aplikasi desktop berbasis **Tauri** yang dirancang untuk mengonversi dokumen PDF dan gambar menjadi format **Markdown** yang bersih dan terstruktur menggunakan kemampuan AI Vision (Multimodal).

## Fitur Utama

- **Konversi PDF ke Markdown**: Unggah PDF dan biarkan AI mengekstrak teks, tabel, dan struktur dokumen secara akurat.
- **Dukungan Multi-Provider**:
  - **Google Gemini**: Menggunakan Google AI Studio API.
  - **OpenRouter**: Akses ke berbagai model vision.
  - **Ollama**: Menjalankan model vision secara lokal.
- **Penanganan Gambar & Diagram**: Mendeteksi chart atau diagram secara otomatis dan memberikan deskripsi tekstual beserta koordinat crop.
- **Smart Storage Modes**: Mendukung pengiriman gambar via Base64, Google Files API, atau Supabase Storage untuk efisiensi token dan latensi.
- **Benchmark Suite**: Alat bawaan untuk menguji dan membandingkan performa antar model (TTFT, TPS, biaya, dan akurasi).
- **Statistik Riwayat**: Melacak penggunaan token, biaya estimasi, dan efisiensi ekstraksi.

## Cara Penggunaan

1. **Konfigurasi API**:
   - Buka tab **Settings**.
   - Pilih provider yang ingin digunakan (Google, OpenRouter, atau Ollama).
   - Masukkan API Key yang diperlukan (disimpan secara lokal di browser).
   - Klik **Save Configuration**.

2. **Ekstraksi Dokumen**:
   - Buka tab **Extract**.
   - Seret dan lepaskan file PDF atau gambar ke area unggah.
   - Pilih halaman yang ingin diproses.
   - Klik **Extract to Markdown**.
   - Hasil akan muncul di editor sebelah kanan dan dapat langsung disalin atau diunduh.

3. **Benchmarking** (Untuk Pengujian):
   - Buka tab **Benchmark**.
   - Unggah file PDF contoh.
   - Pilih skenario (misal: Gemini vs Ollama).
   - Jalankan benchmark untuk melihat perbandingan kecepatan dan kualitas secara real-time.

## Pengembangan (Development)

Aplikasi ini dibangun menggunakan:
- **Frontend**: React + TypeScript + Vite
- **Desktop Framework**: Tauri v2
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

### Menjalankan secara Lokal:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Jalankan aplikasi dalam mode dev:
   ```bash
   npm run tauri dev
   ```
3. Build aplikasi:
   ```bash
   npm run tauri build
   ```
