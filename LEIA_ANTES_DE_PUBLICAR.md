# Marco Iris Tecnologia v2.5.4 — pacote público

Este pacote contém somente o código do aplicativo e pode ser usado na homologação do GitHub Pages.

## Nunca publicar junto

- a pasta `migration/`;
- o pacote privado de migração;
- `Marco_Iris_Dados.migrado.json`;
- PDFs, fotos, planilhas ou documentos de clientes.

A migração histórica é feita pelo navegador: o operador abre o aplicativo público, conecta o Google Drive e seleciona localmente a pasta privada. Os arquivos privados não precisam e não devem passar pelo GitHub.

Na tela **Configurações → Backup e migração**, use o cartão **Migração histórica preparada**. Não use a migração genérica do AppSheet para este pacote.

Antes de produção, siga `CHECKLIST_HOMOLOGACAO_MARCO_V2_5_4.md`. Os testes locais passaram, mas Google Drive, WhatsApp e sincronização entre dispositivos precisam da homologação manual com as contas reais.
