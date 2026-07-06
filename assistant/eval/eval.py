#!/usr/bin/env python3
"""Eval the RAG retrieval: hit-rate@3, MRR, latency. Writes eval/REPORT.md.
The hire signal — measured, not asserted."""
import os, json, time, math
from fastembed import TextEmbedding

REPO = os.path.expanduser("~/workspace/bet/protocol-tracker")
A = os.path.join(REPO, "assistant")
idx = json.load(open(os.path.join(A, "index.json"), encoding="utf-8"))
gold = json.load(open(os.path.join(A, "eval", "golden.json"), encoding="utf-8"))
chunks = idx["chunks"]

def cos(a, b):
    return sum(x*y for x, y in zip(a, b))  # vectors are normalized

emb = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
K = 3
hits, rr, lat = 0, 0.0, []
rows = []
for g in gold:
    t0 = time.time()
    qv = list(emb.embed([g["q"]]))[0]
    scored = sorted(chunks, key=lambda c: cos(qv, c["embedding"]), reverse=True)[:K]
    lat.append((time.time()-t0)*1000)
    srcs = [c["source"] for c in scored]
    rank = next((i+1 for i, s in enumerate(srcs) if s == g["expect"]), 0)
    if rank: hits += 1; rr += 1/rank
    rows.append((g["q"], g["expect"], srcs[0], "✓" if rank else "✗"))

n = len(gold)
report = [
    "# Protocol Tracker — Assistant: retrieval eval",
    f"\nCorpus: {len(chunks)} chunks from the app's own docs · model all-MiniLM-L6-v2 · top-k={K}\n",
    f"| Metric | Value |", "|---|---|",
    f"| Hit-rate@{K} | **{hits}/{n} = {hits/n:.0%}** |",
    f"| MRR | **{rr/n:.2f}** |",
    f"| Avg retrieval latency | **{sum(lat)/n:.0f} ms** |\n",
    "| Question | Expected | Top hit | |", "|---|---|---|---|",
]
for q, e, top, ok in rows:
    report.append(f"| {q} | {e} | {top} | {ok} |")
open(os.path.join(A, "eval", "REPORT.md"), "w", encoding="utf-8").write("\n".join(report))
print(f"hit@{K}={hits}/{n}  MRR={rr/n:.2f}  lat={sum(lat)/n:.0f}ms")
