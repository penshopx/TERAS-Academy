import fitz
from pathlib import Path

pdf_path = Path("attached_assets/TERAS_Academy_Master_Architecture_v1.0_1788397976253.pdf")
output_dir = Path(".agents/outputs/teras_pdf_pages")
output_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"pages={doc.page_count}")
print(f"metadata={doc.metadata}")

for index, page in enumerate(doc):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{index + 1:02d}.png"
    pixmap.save(output_path)
    text = page.get_text("text").strip().replace("\n", " ")
    print(f"page={index + 1} size={page.rect.width:.0f}x{page.rect.height:.0f} text_chars={len(text)} preview={text[:180]}")