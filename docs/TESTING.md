# Testes MCP

Atualizado: 2026-11-21 22:54Z

```

[1m[30m[46m RUN [49m[39m[22m [36mv5.1.1 [39m[90m/home/marcosdutradasilva9/parametrIX[39m
      [2mCoverage enabled with [22m[33mv8[39m

 [32m✓[39m tests/mcp/unit.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/mcp/integration.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 2078[2mms[22m[39m
   [32m✓[39m seguranca (via tunel simulado) [2m(7)[22m
     [33m[2m✓[22m[39m payload gigante nao derruba o servidor[33m 504[2mms[22m[39m
   [32m✓[39m stress / performance [2m(2)[22m
     [33m[2m✓[22m[39m limite de concorrencia gera 429 sem erro 5xx inesperado[33m 973[2mms[22m[39m
     [33m[2m✓[22m[39m tools/list: p95 < 50 ms em 200 chamadas sequenciais[33m 357[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m22 passed[39m[22m[90m (22)[39m
[2m   Start at [22m 22:54:40
[2m   Duration [22m 2.42s[2m (tests 91%, import 5%, worker 3%, transform 1%)[22m

[34m % [39m[2mCoverage report from [22m[33mv8[39m
----------------|---------|----------|---------|---------|-------------------
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
----------------|---------|----------|---------|---------|-------------------
All files       |     100 |      100 |     100 |     100 |                   
 mcpLimits.ts   |     100 |      100 |     100 |     100 |                   
 tunnelGuard.ts |     100 |      100 |     100 |     100 |                   
----------------|---------|----------|---------|---------|-------------------
```
