# Protocol Tracker — Assistant: retrieval eval

Corpus: 53 chunks from the app's own docs · model all-MiniLM-L6-v2 · top-k=3

| Metric | Value |
|---|---|
| Hit-rate@3 | **8/10 = 80%** |
| MRR | **0.63** |
| Avg retrieval latency | **33 ms** |

| Question | Expected | Top hit | |
|---|---|---|---|
| How is my backup data encrypted? | README.md | README.md | ✓ |
| Where is my patient data stored? | README.md | README.md | ✓ |
| How do I move my data to another device? | DEVICE_TRANSFER_DESIGN.md | DEVICE_TRANSFER_DESIGN.md | ✓ |
| Does the app work offline? | README.md | README.md | ✓ |
| What is the backup file format? | DATA_CONTRACT.md | README.md | ✗ |
| What happens if I lose my passphrase? | README.md | README.md | ✓ |
| How is the data structured or what fields are stored? | DATA_CONTRACT.md | HANDOFF.md | ✓ |
| How is the native app wrapper built? | WRAPPER_BUILD.md | HANDOFF.md | ✓ |
| Is my data ever sent to a server? | README.md | DEVICE_TRANSFER_DESIGN.md | ✓ |
| What key derivation is used for encryption? | README.md | DEVICE_TRANSFER_DESIGN.md | ✗ |