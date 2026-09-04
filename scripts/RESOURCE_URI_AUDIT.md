# Audit URI resource lama

Audit ini memeriksa setiap `teras_content_resources.uri` yang tidak kosong. Hanya
URI absolut dengan protokol HTTP atau HTTPS yang dianggap aman.

## 1. Jalankan upgrade

Jalur post-merge menjalankan upgrade ini secara otomatis. Untuk jalur deployment
atau upgrade lain, jalankan perintah yang sama dengan identitas operator:

```sh
TERAS_MIGRATION_ACTOR=deployment-upgrade \
  bash scripts/apply-resource-uri-upgrade.sh
```

Runner memasang migrasi audit, mengarantina temuan secara atomik, lalu gagal jika
audit verifikasi masih menemukan URI tidak aman.

## 2. Laporan tanpa perubahan

```sh
pnpm --filter @workspace/scripts run audit:resource-uris
```

Setiap temuan ditulis sebagai JSON per baris, diikuti ringkasan. Mode ini membuka
transaksi hanya untuk memperoleh snapshot yang konsisten lalu melakukan rollback;
tidak ada data yang diubah. Tambahkan `--fail-on-findings` jika temuan harus
menghasilkan exit code 1 di CI.

## 3. Karantina

```sh
pnpm --filter @workspace/scripts run audit:resource-uris -- --quarantine --actor=nama-operator
```

Dalam satu transaksi, proses ini:

1. menyalin URI asli, klasifikasi masalah, operator, dan waktu ke tabel audit;
2. mengubah URI aktif menjadi `NULL`; dan
3. tidak menghapus resource maupun kontennya.

Jika transaksi gagal, seluruh perubahan dibatalkan.

## 4. Perbaikan dan pemulihan

Tinjau URI asli dari tabel audit. Setelah menentukan URL HTTPS pengganti yang
aman, lakukan perubahan dalam satu transaksi dan simpan jejak resolusinya:

```sql
BEGIN;
UPDATE teras_content_resources
SET uri = 'https://example.com/path', updated_at = now()
WHERE id = 'resource-id' AND uri IS NULL;

UPDATE teras_content_resource_uri_audit
SET resolved_at = now(), resolution_note = 'Diganti dengan URL HTTPS terverifikasi'
WHERE resource_id = 'resource-id'
  AND action = 'QUARANTINED'
  AND resolved_at IS NULL;
COMMIT;
```

Jangan memulihkan nilai asli yang masih diklasifikasikan tidak aman. Jalankan
mode laporan sekali lagi sesudah perbaikan.