# Engines open source e referências GrabCAD

## Composição implementada

O ParametrIX mantém o motor local determinístico separado dos adapters HTTP opcionais. Os adapters só afirmam `executed` quando uma requisição real retorna HTTP de sucesso. Timeout, DNS, autenticação ausente e HTTP de erro retornam `not_executed`; não são convertidos em mock ou fixture.

A composição recomendada é ERPNext como ERP transacional e manufatura, Twenty como CRM opcional, Metabase OSS como BI desacoplado e Medusa como e-commerce opcional. Nenhum deles foi tratado como CAD, CAE ou CAM nativo. O fluxo de engenharia envia por padrão identificadores, revisão, BOM, quantidade, status, links e indicadores; geometria, malha, PMI, resultado CAE e trajetória CAM permanecem nos sistemas especializados.

O ERPNext documenta REST para DocTypes, webhooks por evento, BOM, Work Order, Job Card e ciclo comercial. O adapter usa API key/secret e endpoints `/api/resource`. O Twenty documenta self-hosting, objetos customizados, REST/GraphQL e webhooks; o adapter usa endpoints REST configuráveis para objetos de CRM. O Metabase OSS documenta Docker/JAR, conexões a bancos, API e dashboards; o adapter publica consultas/cartões e indicadores, mas não presume ingestão por webhook. A Medusa documenta módulos de comércio, rotas REST, workflows, subscribers e integração bidirecional com ERP; o adapter mantém BOM e produção fora do storefront.

## Biblioteca setorial e GrabCAD

A biblioteca agora expõe etapas CAD/CAE/CAM/ERP/CRM/BI por categoria e um registro explícito de referências GrabCAD. Cada referência tem URL pública, título observado, setor, `usage: link-only-metadata`, `licenseStatus: verify-per-item`, `attributionRequired: true` e `downloaded: false`.

Isso significa que o repositório ParametrIX não contém geometria, render, malha ou arquivo CAD de terceiros. A página pública é descoberta/benchmark e não prova licença, autoria suficiente para redistribuição, validação técnica ou autorização de fabricação. Antes de qualquer download, derivação, uso comercial, treinamento ou fabricação, o usuário deve verificar a licença do item e obter autorização do titular quando necessário.

## Fontes oficiais consultadas

### Engines

- ERPNext: [repositório oficial](https://github.com/frappe/erpnext), [REST API Frappe](https://docs.frappe.io/framework/user/en/api/rest), [webhooks](https://docs.frappe.io/framework/user/en/guides/integration/webhooks), [manufatura](https://docs.frappe.io/erpnext/manufacturing), [CRM](https://docs.frappe.io/erpnext/CRM).
- Odoo Community foi avaliado como alternativa, mas não foi escolhido como adapter padrão por causa das diferenças entre Community autogerenciado, API externa hospedada e recursos de Studio/webhooks: [repositório](https://github.com/odoo/odoo), [licenças](https://www.odoo.com/documentation/19.0/legal/licenses.html), [API externa](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html).
- Twenty: [repositório e licença](https://github.com/twentyhq/twenty), [self-hosting](https://docs.twenty.com/developers/self-host/self-host), [API](https://docs.twenty.com/developers/extend/api.md), [webhooks](https://docs.twenty.com/developers/extend/webhooks.md), [objetos e relações](https://docs.twenty.com/developers/extend/apps/data/objects.md).
- Metabase: [repositório e licença OSS](https://github.com/metabase/metabase), [Docker](https://www.metabase.com/docs/latest/installation-and-operation/running-metabase-on-docker), [bancos](https://www.metabase.com/docs/latest/databases/connecting), [API](https://www.metabase.com/docs/latest/api), [webhooks de alertas](https://www.metabase.com/docs/latest/configuring-metabase/webhooks).
- Medusa: [repositório e licença](https://github.com/medusajs/medusa), [instalação](https://docs.medusajs.com/learn/installation), [rotas](https://docs.medusajs.com/learn/fundamentals/api-routes), [eventos/subscribers](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers), [módulos](https://docs.medusajs.com/learn/fundamentals/modules), [receita de ERP](https://docs.medusajs.com/resources/recipes/erp).

### Interoperabilidade e referência industrial

- GrabCAD: [Termos de uso](https://grabcad.com/terms). As páginas comunitárias são conteúdo de terceiros; por isso o catálogo guarda apenas links e metadados.
- NIST: [STEP at NIST](https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/step-nist), como referência pública para ISO 10303 e troca de dados de produto.
- ISO: [ISO 10303-1:2024](https://www.iso.org/standard/83105.html), citada apenas como referência normativa, sem copiar texto protegido.
- buildingSMART: [Industry Foundation Classes](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/), para interoperabilidade BIM/IFC.
- Dispositivos médicos: [ISO 13485](https://www.iso.org/iso-13485-medical-devices.html), [ISO 14971](https://www.iso.org/standard/72704.html) e [FDA Design Controls](https://www.fda.gov/media/116762/download), usados como referências de governança, não como autorização para reutilizar modelos.

## Estado da evidência

A presença do adapter no código não prova que um servidor externo esteja disponível. Para provar execução real, configure a URL e credenciais do engine, execute o health check e preserve o objeto `ExecutionEvidence`. Sem esse run, o estado permanece indisponível/não executado. Fixtures determinísticas do motor local continuam válidas para testes do kernel, mas são classificadas separadamente de adapters externos.
