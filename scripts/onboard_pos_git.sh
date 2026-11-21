#!/bin/bash
# ONBOARD POS-GIT: git, ambiente, fonte, dist, runtime, scripts. Sem exit/kill.
# Rapido: bash scripts/onboard_pos_git.sh | Completo: FULL=1 bash scripts/onboard_pos_git.sh
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PASSED=0; FAILED=0; TOTAL=0; FAILS=""
t() {
  TOTAL=$((TOTAL+1))
  if eval "$2" >/dev/null 2>&1; then PASSED=$((PASSED+1))
  else FAILED=$((FAILED+1)); FAILS="$FAILS\n  FAIL $TOTAL: $1"; echo "FAIL $TOTAL: $1"; fi
}
fb_key_ok() { K=$(grep -oE 'AIza[0-9A-Za-z_-]{30,}' firebase-applet-config.json | head -1); ! grep -rhoE 'AIza[0-9A-Za-z_-]{30,}' dist | grep -vxF "$K" | grep -q . ; }
echo "===== CAMADA 1: GIT ====="
t "dentro de repo git" "git rev-parse --is-inside-work-tree"
t "branch main" '[ "$(git branch --show-current)" = main ]'
t "fetch origin ok" "timeout 25 git fetch -q origin"
t "sem alteracoes pendentes" '[ -z "$(git status --porcelain --untracked-files=no)" ]'
t "sem untracked em src/scripts" '[ -z "$(git ls-files --others --exclude-standard src scripts)" ]'
t "nao esta ahead" '[ "$(git rev-list --count origin/main..HEAD)" = 0 ]'
t "nao esta behind" '[ "$(git rev-list --count HEAD..origin/main)" = 0 ]'
t "HEAD == origin/main" '[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]'
t "sem marcador de conflito" "! git grep -nE '^(<<<<<<< |>>>>>>> )' -- . ':!package-lock.json'"
t ".env nao rastreado" '[ -z "$(git ls-files | grep -E "(^|/)\.env(\$|\.)" | grep -v example)" ]'
t "node_modules nao rastreado" '[ -z "$(git ls-files node_modules | head -1)" ]'
t "dist nao rastreado" '[ -z "$(git ls-files dist | head -1)" ]'
t "sem .bak/.orig rastreados" '[ -z "$(git ls-files | grep -E "\.(bak|pre-split|orig|rej)\$")" ]'
t ".gitignore cobre node_modules" "grep -q node_modules .gitignore"
t ".gitignore cobre dist" "grep -qE '^/?dist' .gitignore"
t ".gitignore cobre .env" "grep -q '^\.env' .gitignore"
t "package-lock rastreado" "git ls-files --error-unmatch package-lock.json"
t "lock == HEAD" '[ "$(sha256sum < package-lock.json)" = "$(git show HEAD:package-lock.json | sha256sum)" ]'
t "nenhum rastreado > 2MB" '[ -z "$(git ls-files -z | xargs -0 du -k 2>/dev/null | awk "\$1>2048")" ]'
t "sem segredos rastreados" "! git grep -nE '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH) PRIVATE)' -- . ':!package-lock.json' ':!scripts/onboard_pos_git.sh' ':!firebase-applet-config.json'"
t "token fora da URL do remote" "! git remote -v | grep -qE 'https://[^/@ ]+:[^@ ]+@'"
t "ultimo commit tem mensagem" '[ -n "$(git log -1 --pretty=%s)" ]'
t "git fsck ok" "git fsck --no-progress --connectivity-only"
t "credential.helper configurado" "git config --global credential.helper"
t "user.email configurado" "git config user.email"
t "um unico lockfile rastreado" '[ "$(git ls-files bun.lock package-lock.json yarn.lock pnpm-lock.yaml | wc -l)" = 1 ]'
echo "===== CAMADA 2: AMBIENTE E CONFIG ====="
t "node >= 22.12" "node -v | grep -qE '^v(22\.(1[2-9]|[2-9][0-9])|2[3-9]|[3-9][0-9])\.'"
t "npm disponivel" "command -v npm"
t "python3 disponivel" "command -v python3"
t "package.json valido" "node -e \"JSON.parse(require('fs').readFileSync('package.json','utf8'))\""
t "package-lock valido" "node -e \"JSON.parse(require('fs').readFileSync('package-lock.json','utf8'))\""
t "lockfileVersion 3" "node -p \"require('./package-lock.json').lockfileVersion\" | grep -q 3"
t "node_modules existe" "[ -d node_modules ]"
t "vite 8.x" "grep -q '\"version\": \"8\.' node_modules/vite/package.json"
t "react instalado" "[ -d node_modules/react ]"
t "three instalado" "[ -d node_modules/three ]"
t "script build no package.json" "grep -q '\"build\"' package.json"
t "npm ls sem erros" "npm ls --depth=0"
t "vite.config.ts existe" "[ -f vite.config.ts ]"
t "sem __dirname no vite.config" "! grep -q __dirname vite.config.ts"
t "manualChunks e funcao" "grep -q 'manualChunks: (id' vite.config.ts"
t "regra vendor-three" "grep -q vendor-three vite.config.ts"
t "regra vendor-react" "grep -q vendor-react vite.config.ts"
t "plugin tailwind" "grep -q tailwindcss vite.config.ts"
t "plugin react" "grep -q plugin-react vite.config.ts"
t "rolldownOptions (Vite 8)" "grep -q rolldownOptions vite.config.ts"
t "tsconfig.json" "[ -f tsconfig.json ]"
t "index.html na raiz" "[ -f index.html ]"
t "server.ts" "[ -f server.ts ]"
t "server usa porta 3000" "grep -q 3000 server.ts"
t ".npmrc existe" "[ -f .npmrc ]"
echo "===== CAMADA 3: FONTE ====="
for f in $(grep -oE "from '\./[^']+'" src/App.tsx | sed "s/from '//;s/'$//" | sort -u); do
  t "App.tsx resolve $f" "ls src/$f.ts src/$f.tsx src/$f/index.ts src/$f/index.tsx 2>/dev/null | grep -q ."
done
for P in FrostbiteRackDashboard EcosystemHubPanel CamRoboticsPanel AdditiveCamConfigPanel GrasshopperCanvas SustainabilityDashboard; do
  t "$P sem import estatico de valor" "! grep -nE \"^import \{[^}]*\} from '[^']*/$P'\" src/App.tsx"
  t "$P carregado via import()" "grep -rq \"import('[^']*/$P')\" src"
done
t "Suspense no App" "grep -q Suspense src/App.tsx"
t "sem debugger" "! grep -rnw debugger src"
t "sem @ts-nocheck" "! grep -rn '@ts-nocheck' src"
t "sem segredos em src/server" "! grep -rnE '(AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})' src server.ts"
t "sem URL localhost fixa em src" "! grep -rnE 'https?://(localhost|127\.0\.0\.1)' src --exclude=AgentVoiceCommandBar.tsx"
t "firebase em no maximo 3 arquivos" '[ "$(grep -rlE "from .firebase" src | wc -l)" -le 3 ]'
t "kernel nao importa components" "! grep -rnE \"from '\.\./components\" src/kernel"
t "kernel-cad nao importa kernel-cam" "! grep -nE 'camProcessEngine|camRobotics' src/kernel/nurbs.ts src/kernel/cadFormats.ts src/kernel/componentClassifier.ts"
t "sem arquivo src vazio" '[ -z "$(find src -name "*.ts*" -size 0)" ]'
t "sem copia/backup em src" '[ -z "$(find src \( -iname "*copy*" -o -name "*.bak" \))" ]'
t "nenhum fonte > 250KB" '[ -z "$(find src -name "*.ts*" -size +250k)" ]'
if [ -z "$PRE" ]; then
echo "===== CAMADA 4: ARTEFATO (dist) ====="
if [ -n "$FULL" ]; then
  NODE_OPTIONS=--max-old-space-size=1536 npm run build > /tmp/build.log 2>&1; BRC=$?
  t "build exit 0" "[ $BRC = 0 ]"
  t "build sem erro" "! grep -qiE '(^|[^a-z])error' /tmp/build.log"
  t "build sem chunk circular" "! grep -qi circular /tmp/build.log"
  NODE_OPTIONS=--max-old-space-size=1536 npx tsc --noEmit > /tmp/tsc.log 2>&1; TRC=$?
  t "tsc --noEmit 0 erros" "[ $TRC = 0 ]"
fi
t "dist/index.html existe" "[ -f dist/index.html ]"
t "dist nao esta velho" '[ -z "$(find src vite.config.ts index.html -newer dist/index.html -type f | head -1)" ]'
t "index.html tem 1 script" '[ "$(grep -o "<script" dist/index.html | wc -l)" = 1 ]'
t "preload SEM panel-*" "! grep -o 'modulepreload[^>]*' dist/index.html | grep -q 'panel-'"
t "preload SEM vendor-firebase" "! grep -o 'modulepreload[^>]*' dist/index.html | grep -q 'vendor-firebase'"
t "preload SEM vendor-three" "! grep -o 'modulepreload[^>]*' dist/index.html | grep -q 'vendor-three'"
for c in vendor-react vendor-three vendor-firebase panel-frostbite panel-ecosystem panel-cam panel-grasshopper panel-sustainability kernel-cad kernel-cam; do
  t "chunk $c existe" "ls dist/assets/$c-*.js"
done
t "index-*.js < 600kB" '[ "$(stat -c %s dist/assets/index-*.js)" -lt 614400 ]'
t "nenhum chunk > 500kB fora de vendor-*" '[ -z "$(find dist/assets -name "*.js" -size +500k ! -name "vendor-*")" ]'
t "dist < 4MB" '[ "$(du -sk dist | cut -f1)" -lt 4096 ]'
t "sem sourcemap em dist" '[ -z "$(find dist -name "*.map")" ]'
t "sem segredo no bundle" "! grep -rlE '(ghp_[A-Za-z0-9]{20,}|sk-ant-)' dist" && fb_key_ok
t "src/assets copiado p/ dist" '[ ! -d src/assets ] || [ -d dist/src/assets ]'
ASSETS=$(grep -oE '(href|src)="/assets/[^"]+"' dist/index.html | sed -E 's/^[a-z]+="//;s/"$//' | sort -u)
for h in $ASSETS; do t "arquivo do index.html existe: $h" "[ -f dist$h ]"; done
echo "===== CAMADA 5: RUNTIME ====="
U=http://127.0.0.1:3000
t "servidor responde 200" "curl -sf -o /dev/null $U/"
t "content-type html" "curl -sI $U/ | grep -qi text/html"
t "resposta < 2s" "[ \"\$(curl -s -o /dev/null -w '%{time_total}' $U/ | cut -d. -f1)\" -lt 2 ]"
t "processo server.ts vivo" "ps aux | grep -q '[s]erver.ts'"
t "RSS do server < 450MB" "ps aux | grep '[s]erver.ts' | awk '{s+=\$6} END{exit !(s<460000)}'"
t "RAM available > 800MB" '[ "$(free -m | awk "/Mem:/{print \$7}")" -gt 800 ]'
t "disco livre > 500MB" '[ "$(df -Pm . | awk "NR==2{print \$4}")" -gt 500 ]'
for h in $ASSETS; do
  t "HTTP 200 $h" "curl -sf -o /dev/null $U$h"
  t "MIME correto $h" "curl -sI $U$h | grep -qiE 'javascript|text/css'"
done
fi
echo "===== CAMADA 6: SCRIPTS E CI ====="
for s in scripts/*.sh; do
  t "sintaxe bash $s" "bash -n $s"
  t "executavel $s" "[ -x $s ]"
done
t "README.md" "[ -f README.md ]"
t "workflow CI" "ls .github/workflows/*.yml"
echo "===== RESULTADO ====="
echo "PASS: $PASSED / $TOTAL | FAIL: $FAILED"
[ "$FAILED" -gt 0 ] && echo -e "$FAILS"
if [ -n "$PRE" ]; then echo "PRE: camadas 4-5 puladas"; elif [ "$TOTAL" -ge 100 ]; then echo "COBERTURA OK: $TOTAL checagens (>=100)"; else echo "COBERTURA INSUFICIENTE: $TOTAL < 100"; fi
