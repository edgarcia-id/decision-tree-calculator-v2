# 🌳 Kalkulator Decision Tree

**Kalkulator pohon keputusan gratis untuk mahasiswa, dosen, dan peneliti.** Susun simpul keputusan, peluang, dan akhir; kalkulator menghitung mundur nilai harapan, menunjukkan kebijakan optimal, profil risiko, analisis sensitivitas, dan nilai informasi (EVPI, EVSI). Hasilnya bisa diunduh sebagai laporan PDF, Word, dan Excel dengan rumus hidup yang siap dilampirkan di skripsi atau tesis. Semuanya berjalan di browser: tanpa akun, tanpa server, tanpa biaya.

*English: a free, browser-only decision tree calculator with expected-value rollback, exponential utility and certainty equivalents, risk profiles, one-way/tornado/spider/two-way sensitivity analysis, EVPI, Bayesian revision and EVSI, and PDF/Word/Excel reports with live formulas.*

[![Buka aplikasi](https://img.shields.io/badge/Buka_aplikasi-Decision_Tree_Calculator-4f46e5?style=for-the-badge&logo=githubpages)](https://edgarcia-id.github.io/decision-tree-calculator-v2/)
[![Metode](https://img.shields.io/badge/Metode-Decision_Analysis-10b981?style=for-the-badge)](#metode-dan-rumus)
[![Arsitektur](https://img.shields.io/badge/Arsitektur-100%25_di_browser-f59e0b?style=for-the-badge)](#privasi)
[![Lisensi](https://img.shields.io/badge/Lisensi-MIT-0f172a?style=for-the-badge)](LICENSE)

👉 **[edgarcia-id.github.io/decision-tree-calculator-v2](https://edgarcia-id.github.io/decision-tree-calculator-v2/)**

---

## Fitur

### Dua cara memasukkan model
- **Pohon keputusan**: simpul **keputusan** (□), **peluang** (○), dan **akhir** (◁) bertingkat tanpa batas praktis. Setiap cabang punya peluang (untuk simpul peluang) dan **arus kas**; nilai jalur = jumlah arus kas sepanjang jalur + nilai akhir. Tambah, salin (beserta subpohon), pindahkan, dan hapus cabang; ubah jenis simpul kapan saja.
- **Tabel payoff**: alternatif × kondisi beserta peluangnya, untuk soal keputusan satu tahap di buku teks. Tempel blok angka langsung dari Excel. Tabel bisa dijadikan pohon keputusan setara untuk diolah lebih lanjut.
- **Variabel dan rumus**: isian yang diawali `=` adalah rumus, misalnya `=untung*0,6 - biaya`, `=1-p`, `=max(a; b)`. Operator `+ − × / ^ %`, fungsi `min`, `max`, `abs`, `sqrt`, `exp`, `ln`, `log`, `round`.
- Peluang dalam persen (`60`) atau desimal (`0,6`); desimal koma atau titik; angka format Indonesia seperti `1.250.000` dikenali.
- Tujuan **maksimalkan** (laba, manfaat) atau **minimalkan** (biaya, waktu).
- Empat contoh siap pakai: layanan pesan antar kedai (contoh versi pertama), peluncuran produk dengan uji pasar (dua tahap, variabel), ekspansi pabrik (tabel payoff dan survei, contoh buku teks), dan pemilihan vendor (biaya minimum).

### Hasil
- **Rekomendasi** dan **kebijakan optimal** di setiap titik keputusan, diagram pohon dengan jalur optimal ditebalkan dan cabang yang tidak dipilih ditandai ∥. Klik simpul di diagram untuk langsung menuju isiannya.
- **Langkah perhitungan mundur** di setiap simpul, misalnya `EV = 0,6 × 35,00 + 0,4 × (−5,00) = 19,00`, siap disalin ke laporan.
- **Profil risiko** (distribusi peluang dan kumulatif) tiap alternatif, simpangan baku, nilai minimum/maksimum, peluang rugi, dan **dominansi stokastik** orde pertama dan kedua.
- **Sikap terhadap risiko**: utilitas eksponensial menghindari risiko atau menyukai risiko dengan toleransi risiko R; keputusan memakai utilitas harapan dan nilai ditampilkan sebagai *certainty equivalent*.
- Mode tabel: kriteria **maximax, maximin, Hurwicz (α), Laplace, minimax regret, nilai harapan, EOL**, tabel regret, dan alternatif terpilih tiap kriteria.

### Sensitivitas
- **Satu arah**: nilai setiap alternatif terhadap satu parameter (peluang, arus kas, payoff, atau variabel) dan **titik impas** saat keputusan terbaik berganti. Saat satu peluang diubah, peluang lain di simpul yang sama diskalakan proporsional.
- **Tornado**: semua parameter digeser ±% (nilai) dan ± poin persen (peluang), diurutkan menurut pengaruhnya, dengan penanda bila keputusan berubah.
- **Spider**: perubahan nilai keputusan bila parameter digeser −50% sampai +50%.
- **Dua arah**: peta wilayah strategi terbaik untuk kombinasi dua parameter.

### Nilai informasi
- **EVPI per ketidakpastian** dan gabungan untuk pohon keputusan (simpul peluang dengan nama dan cabang yang sama dianggap satu ketidakpastian).
- Mode tabel: **EVwPI dan EVPI**, **revisi Bayes** (keandalan, peluang bersama, peluang indikator, posterior), **EVSI**, efisiensi informasi, dan nilai bersih setelah biaya survei.

### Unduhan
- **Laporan PDF**: identitas, rekomendasi, kebijakan optimal, diagram pohon (halaman lanskap untuk pohon yang lebar), struktur model, langkah rollback, profil risiko, sensitivitas, nilai informasi, daftar jalur, dan rujukan.
- **Laporan Word (.docx)**: isi yang sama dalam bentuk judul, tabel bernomor, dan gambar bernomor yang bisa disunting untuk Bab IV.
- **Excel (.xlsx) dengan rumus hidup**: sheet *Pohon* berisi satu baris per simpul dengan rumus rollback (`p×nilai`, `MAX`/`MIN`, utilitas `EXP`/`LN`, pilihan optimal dengan `IF`), variabel sebagai **nama terdefinisi** (`v_nama`) yang dipakai rumus, *Jalur* (peluang jalur sebagai hasil kali sel peluang), *Tabel payoff* (rumus kriteria, regret, EVwPI, EVPI), *Bayes & EVSI* (rumus revisi Bayes dan EVSI), *Profil risiko*, *Sensitivitas*, dan *Nilai informasi*. Ubah satu sel kuning, seluruh pohon dihitung ulang.
- **CSV** semua jalur, **diagram PNG/SVG**, **proyek .json**, dan **tautan proyek** (model terkompresi di dalam tautan, tanpa server) untuk dikirim ke dosen pembimbing.

## Cara memakai

1. **Model**: pilih *Pohon keputusan* atau *Tabel payoff*, isi pilihan, peluang, dan nilai. Atur tujuan, satuan, dan sikap terhadap risiko.
2. **Hasil**: rekomendasi, kebijakan optimal, diagram, profil risiko, langkah perhitungan, dan semua jalur.
3. **Sensitivitas**: satu arah, tornado, spider, dua arah.
4. **Nilai informasi**: EVPI, revisi Bayes, EVSI.
5. **Laporan & unduh**: PDF, Word, Excel, CSV, JSON, tautan.

## Metode dan rumus

- Nilai jalur = Σ arus kas cabang sepanjang jalur + nilai akhir.
- Simpul peluang: EV = Σ p<sub>i</sub> × nilai<sub>i</sub> (Σ p<sub>i</sub> harus 1).
- Simpul keputusan: nilai = maks (atau min untuk biaya) nilai cabang; kebijakan optimal = cabang terpilih di setiap simpul keputusan.
- Utilitas eksponensial: menghindari risiko U(x) = 1 − e<sup>−x/R</sup>, CE = −R ln(1 − EU); menyukai risiko U(x) = e<sup>x/R</sup> − 1, CE = R ln(1 + EU).
- EVPI = nilai keputusan bila hasil ketidakpastian diketahui sebelum memutuskan − nilai keputusan sekarang.
- Tabel payoff: Hurwicz = α × terbaik + (1 − α) × terburuk; regret = payoff terbaik di kondisi itu − payoff; EOL = Σ p × regret; EVwPI = Σ p<sub>j</sub> × payoff terbaik kondisi j; EVPI = EVwPI − EV terbaik = EOL minimum.
- Bayes: P(kondisi | indikator) = P(indikator | kondisi) × P(kondisi) / P(indikator); EVSI = Σ P(indikator) × EV terbaik bersyarat − EV terbaik tanpa informasi; efisiensi = EVSI / EVPI.
- Titik impas dicari dengan pemindaian lalu *bisection*.

### Validasi

- 22 unit test (`node --test tests/*.test.js`), termasuk pembanding terhadap implementasi Python independen untuk 30 pohon acak (EV, pilihan, profil risiko, CE menghindari/menyukai risiko, tujuan minimum) dan 20 tabel payoff acak (kriteria, Bayes, EVSI).
- Contoh kedai menghasilkan nilai harapan yang sama dengan kalkulator versi pertama (19 juta rupiah vs 0).
- Contoh pabrik cocok dengan angka buku teks: Hurwicz 124 (α = 0,8), EVPI 60, EVSI 19, efisiensi 31,7%, nilai bersih survei 9.
- Rumus berkas Excel dihitung ulang di LibreOffice untuk 13 varian (4 contoh, netral/menghindari/menyukai risiko, maksimum/minimum, dengan/tanpa survei) dan cocok dengan aplikasi tanpa sel galat.
- Uji end-to-end di Chromium (desktop dan ponsel) untuk seluruh alur, termasuk editor pohon, rumus, tempel, unduhan, dan tautan.

## Privasi

Semua perhitungan berjalan di browser Anda. Proyek tersimpan otomatis di penyimpanan lokal browser; unduh berkas `.json` untuk cadangan. Tidak ada analitik, tidak ada pelacak, tidak ada data yang dikirim ke server. Font dan pustaka PDF disertakan di repositori sehingga aplikasi tetap berjalan tanpa CDN.

## Untuk pengembang

```text
index.html               kerangka halaman
assets/js/dt-core.js     mesin hitung murni (rumus, rollback, utilitas, profil risiko, EVPI, sensitivitas, kriteria payoff, Bayes, EVSI)
assets/js/model.js       model proyek, contoh, operasi editor, tautan
assets/js/charts.js      diagram SVG tanpa pustaka (pohon, nilai, profil risiko, tornado, spider, wilayah strategi)
assets/js/export.js      XLSX dengan rumus & DOCX (penulis ZIP sendiri), CSV, PNG/SVG, PDF (jsPDF)
assets/js/app.js         antarmuka
assets/vendor/           jsPDF 3.0.4 + jsPDF-AutoTable 5.0.9 (MIT), dimuat saat PDF diminta
assets/fonts/            Inter (SIL OFL)
tests/                   unit test Node + pembanding Python
```

Jalankan lokal tanpa build:

```bash
python3 -m http.server 8000      # lalu buka http://localhost:8000
node --test tests/*.test.js      # unit test
```

> **Laragon/Apache:** bila server lokal memetakan `.html` ke PHP sehingga halaman tampil *Not Found*, tambahkan berkas `.htaccess` berisi `DirectoryIndex index.html index.php` dan `AddType text/html .html .htm` di folder proyek (tidak diperlukan untuk GitHub Pages).

## Cara mengutip

Bila Anda memakai alat ini dalam skripsi, tesis, atau publikasi:

> Tarigan, A. G. E. (2026). *Decision Tree Calculator* (Versi 2.0) [Perangkat lunak]. https://edgarcia-id.github.io/decision-tree-calculator-v2/

Metadata kutipan juga tersedia di [`CITATION.cff`](CITATION.cff) (tombol **Cite this repository** di GitHub).

Rujukan metode: Raiffa, H. (1968). *Decision Analysis: Introductory Lectures on Choices under Uncertainty*. Addison-Wesley. · Clemen, R. T., & Reilly, T. (2014). *Making Hard Decisions with DecisionTools* (3rd ed.). Cengage Learning. · Kirkwood, C. W. (1997). *Strategic Decision Making: Multiobjective Decision Analysis with Spreadsheets*. Duxbury Press.

---

## Pengembang

**Alfredo (Ed) Garcia** — [LinkedIn](https://www.linkedin.com/in/alfredo-garcia-elbarta-tarigan/) · ORCID [0009-0001-4549-5129](https://orcid.org/0009-0001-4549-5129)

---
*© 2026 Alfredo Garcia. Dirilis dengan lisensi MIT.*
