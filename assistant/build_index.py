#!/usr/bin/env python3
"""Build the RAG index from Protocol Tracker's own docs. Chunk -> embed (MiniLM) -> index.json.
On-device story: index ships static; the browser embeds only the query (same model via transformers.js).
"""
import os, re, json, glob
from fastembed import TextEmbedding

REPO = os.path.expanduser("~/workspace/bet/protocol-tracker")
DOCS = ["README.md", "DATA_CONTRACT.md", "DEVICE_TRANSFER_DESIGN.md", "WRAPPER_BUILD.md", "HANDOFF.md"]
OUT  = os.path.join(REPO, "assistant", "index.json")

def chunk_md(text, source, target=140, overlap=30):
    # split on headings, then pack paragraphs into ~target-word chunks
    blocks, cur_h = [], ""
    for part in re.split(r'(?m)^(#{1,4} .*)$', text):
        if re.match(r'^#{1,4} ', part or ''):
            cur_h = part.strip('# ').strip()
        elif part and part.strip():
            words, buf = part.split(), []
            for w in words:
                buf.append(w)
                if len(buf) >= target:
                    blocks.append((cur_h, " ".join(buf))); buf = buf[-overlap:]
            if len(buf) > overlap:
                blocks.append((cur_h, " ".join(buf)))
    return [{"source": source, "heading": h, "text": t} for h, t in blocks if len(t.split()) > 12]

chunks = []
for d in DOCS:
    p = os.path.join(REPO, d)
    if os.path.exists(p):
        chunks += chunk_md(open(p, encoding="utf-8").read(), d)
print(f"{len(chunks)} chunks from {len(DOCS)} docs")

emb = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
vecs = list(emb.embed([c["text"] for c in chunks]))
for c, v in zip(chunks, vecs):
    c["id"] = f"{c['source']}#{chunks.index(c)}"
    c["embedding"] = [round(float(x), 6) for x in v]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"model": "all-MiniLM-L6-v2", "dim": len(vecs[0]), "chunks": chunks},
          open(OUT, "w", encoding="utf-8"))
print(f"wrote {OUT} ({len(chunks)} chunks, dim {len(vecs[0])})")
