-- Canonical former Help Desk and Energy Assistant answers.  These stable IDs
-- make this safe for both fresh installs and upgrades: an administrator's
-- existing article (including a revision) is never changed by this migration.
INSERT INTO teras_knowledge_articles
  (id, parent_article_id, category, title, body, version, status, audience, published_at, created_by)
VALUES
  (
    'teras-baseline-help-guidance-v1',
    NULL,
    'help',
    'Panduan penggunaan TERAS Academy',
    'Untuk mulai belajar, buka Learning Plan atau daftar Learning, pilih program dan lesson yang tersedia, lalu lanjutkan sesuai urutan perjalanan Anda. Selesaikan materi dan practice yang ditugaskan sebelum mengirim Evidence. Untuk upload video atau bukti praktik, buka Evidence, pilih tugas/modul terkait, isi deskripsi yang menjelaskan pekerjaan Anda, lalu unggah berkas yang diminta. Readiness adalah rekomendasi kesiapan internal TERAS berdasarkan pembelajaran, praktik, evidence, assessment, dan safety gate; readiness membantu menentukan langkah perbaikan atau reassessment berikutnya. TERAS Academy mendukung pengembangan kapabilitas dan persiapan internal, bukan lembaga sertifikasi dan bukan penerbit keputusan kompeten atau sertifikasi resmi.',
    1,
    'published',
    ARRAY['learner', 'trainer', 'assessor', 'admin'],
    now(),
    'system'
  ),
  (
    'teras-baseline-energy-guidance-v1',
    NULL,
    'energy',
    'TERAS dan transisi energi',
    'Transisi energi adalah perubahan bertahap menuju sistem energi yang lebih rendah emisi, aman, andal, dan berkeadilan. TERAS berperan membantu tenaga kerja membangun serta membuktikan kapabilitas teknis melalui learning, practice, evidence, assessment, remediation, dan rekomendasi readiness internal. Kompetensi penting karena pekerjaan transisi energi menuntut pelaksanaan yang aman, bukti praktik yang relevan, dan perbaikan gap sebelum tanggung jawab berikutnya. TERAS Academy mendukung pengembangan kapabilitas dan persiapan internal, bukan lembaga sertifikasi dan bukan penerbit keputusan kompeten atau sertifikasi resmi.',
    1,
    'published',
    ARRAY['learner', 'trainer', 'assessor', 'admin'],
    now(),
    'system'
  )
ON CONFLICT (id) DO NOTHING;