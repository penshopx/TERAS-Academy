import fitz
from pathlib import Path
files = [
 Path('attached_assets/Catatan_Pembacaan_atas_Respons_Prof._Agus_Pakpahan_terhadap_TE_1788568468517.pdf'),
 Path('attached_assets/Melampaui_Hilirisasi_-_TERAS_1788568468518.pdf'),
]
out = Path('.agents/outputs/teras-vision-pdfs')
for path in files:
    doc = fitz.open(path)
    print(f'{path.name}: {doc.page_count} pages')
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
        pix.save(out / f'{path.stem[:35]}-p{i+1}.png')
