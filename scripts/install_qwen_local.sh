#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_TAG="${LLAMA_TAG:-b12608}"
BIN_DIR="$ROOT_DIR/models/llama-bin"
MODEL_DIR="$ROOT_DIR/models/qwen"
MODEL_VARIANT="${MODEL_VARIANT:-instruct}"
if [ "$MODEL_VARIANT" = "coder" ]; then
  MODEL_FILE="$MODEL_DIR/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
  MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
else
  MODEL_FILE="$MODEL_DIR/qwen2.5-0.5b-instruct-q4_k_m.gguf"
  MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
fi

mkdir -p "$BIN_DIR" "$MODEL_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    ASSET_NAME="llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz"
    ;;
  aarch64|arm64)
    ASSET_NAME="llama-${LLAMA_TAG}-bin-ubuntu-arm64.tar.gz"
    ;;
  *)
    echo "ERRO: Arquitetura nao suportada automaticamente ($ARCH)." >&2
    exit 1
    ;;
esac

BIN_URL="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${ASSET_NAME}"
TARBALL_PATH="$ROOT_DIR/models/${ASSET_NAME}"

if [ ! -x "$BIN_DIR/llama-cli" ] && [ ! -x "$BIN_DIR/llama-completion" ]; then
  echo "[Qwen-0.5B] Baixando binario llama.cpp (${LLAMA_TAG} / ${ARCH})..."
  curl -fL --retry 3 --retry-delay 2 -C - -o "$TARBALL_PATH" "$BIN_URL"
  TMP_EXTRACT="$ROOT_DIR/models/.extract_llama_tmp"
  rm -rf "$TMP_EXTRACT"
  mkdir -p "$TMP_EXTRACT"
  tar -xzf "$TARBALL_PATH" -C "$TMP_EXTRACT"
  find "$TMP_EXTRACT" \( -type f -o -type l \) \( -name "llama-*" -o -name "*.so*" \) -exec cp -af {} "$BIN_DIR/" \;
  for f in "$BIN_DIR"/*.so.1.0.0; do
    [ -e "$f" ] || continue
    ln -sf "$(basename "$f")" "${f%.0.0}"
    ln -sf "$(basename "${f%.0.0}")" "${f%.1.0.0}"
  done
  chmod +x "$BIN_DIR"/llama-* 2>/dev/null || true
  rm -rf "$TMP_EXTRACT" "$TARBALL_PATH"
fi

if [ ! -s "$MODEL_FILE" ] || [ "$(wc -c < "$MODEL_FILE")" -lt 300000000 ]; then
  echo "[Qwen-0.5B] Baixando pesos GGUF Qwen2.5-0.5B-Instruct (Q4_K_M ~469MB)..."
  curl -fL --retry 3 --retry-delay 2 -C - -o "$MODEL_FILE" "$MODEL_URL"
fi

CLI_BIN="$BIN_DIR/llama-completion"
if [ ! -x "$CLI_BIN" ]; then
  CLI_BIN="$BIN_DIR/llama-cli"
fi

MODEL_BYTES="$(wc -c < "$MODEL_FILE")"
MODEL_SHA256="$(sha256sum "$MODEL_FILE" | awk '{print $1}')"
CLI_SHA256="$(sha256sum "$CLI_BIN" | awk '{print $1}')"

cat > "$MODEL_DIR/manifest.json" <<EOF
{
  "modelId": "qwen2.5-0.5b-instruct-q4",
  "hfRepo": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  "ggufFile": "models/qwen/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  "ggufBytes": ${MODEL_BYTES},
  "ggufSha256": "${MODEL_SHA256}",
  "binaryPath": "models/llama-bin/$(basename "$CLI_BIN")",
  "binarySha256": "${CLI_SHA256}",
  "llamaTag": "${LLAMA_TAG}",
  "arch": "${ARCH}",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "[Qwen-0.5B] Binario: $CLI_BIN"
echo "[Qwen-0.5B] Modelo: $MODEL_FILE (${MODEL_BYTES} bytes, sha256=${MODEL_SHA256})"
LD_LIBRARY_PATH="$BIN_DIR:${LD_LIBRARY_PATH:-}" "$CLI_BIN" --version 2>&1 | head -n 5 || true
