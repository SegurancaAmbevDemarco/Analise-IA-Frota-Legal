# Validação IA Inspeções

Painel que mostra quantas inspeções a IA validou certo (OK) e quantas errou (NOK), a partir de uma planilha. É uma página estática: não precisa de servidor, banco de dados nem instalação.

## Como a página decide OK e NOK

A coluna usada é **Observação**.

- Observação em branco: **OK**.
- Observação com um traço (`-`) e uma das palavras **Traseira**, **Lateral**, **Frente** ou **Ambos**: **NOK**. Maiúsculas, minúsculas e acentos não importam. Exemplos: `- Lateral`, `- foto lateral`, `- FRENTE`.
- No topo da página, a opção **Exigir traço (-)** pode ser desmarcada. Aí basta a observação citar uma das quatro palavras.

## O que o painel mostra

- Taxa de acerto, total de validações, OK e NOK.
- Gráfico de validações por dia (por mês quando o período é longo).
- Gráfico de onde a IA errou: Traseira, Lateral, Frente e Ambos.
- Tabela de registros com resultado e tipo de erro.
- Filtros por ano, mês, dia, placa (basta digitar parte dela), tipo de erro, motivo e resultado.
- Uma aba para cada cliente (AMBEV REVENDA e AMBEV SPOT T1), cada uma com a sua planilha. O endereço `#ambev-revenda` ou `#ambev-spot-t1` no final do link abre direto no cliente.
- Botão **Baixar PDF**: gera um PDF (A4 paisagem) com os indicadores e gráficos no mesmo layout da tela, mais a lista de registros do filtro atual.
- Botão para exportar o filtro atual em CSV.

## Como a base é atualizada

Cada cliente tem a sua planilha na pasta `dados`:

- `dados/ambev-revenda.xlsx` (AMBEV REVENDA)
- `dados/ambev-spot-t1.xlsx` (AMBEV SPOT T1)

Para atualizar:

1. Abra o repositório no GitHub e entre na pasta `dados`.
2. Clique em **Add file > Upload files** e envie a planilha nova com o mesmo nome. Ela substitui a antiga.
3. Clique em **Commit changes**. Em um ou dois minutos a página publicada passa a mostrar a base nova.

A planilha precisa ter uma linha de títulos com as colunas **Identificador** (ou **Placa**), **Observação**, **Data Validação** e **Motivo**. A coluna Motivo pode ficar vazia; quando tiver texto, o filtro de Motivo lista os valores encontrados. Outras colunas são ignoradas. Linhas sem placa ou sem data são ignoradas, e linhas com a mesma placa e a mesma data e hora contam uma vez só.

O botão **Abrir outra planilha** abre um arquivo só no navegador de quem clicou, para o cliente da aba atual, sem mexer na base do repositório. Ao recarregar a página, volta a base do repositório.

### Como incluir outro cliente

Em `js/app.js`, acrescente uma linha na lista `CLIENTES` (id, nome e caminho do arquivo) e envie a planilha para a pasta `dados`. A aba aparece sozinha.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta, incluindo `.nojekyll`, `vendor` e `dados`.
2. No repositório, abra **Settings > Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, a branch `main` e a pasta `/ (root)`. Clique em **Save**.
4. Depois de alguns minutos, o endereço aparece na mesma tela, no formato `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Atenção com os dados

O site do GitHub Pages é aberto para qualquer pessoa que tenha o link, mesmo que o repositório seja privado, a menos que a organização use um plano que permita restringir o acesso ao site. Se as planilhas da pasta `dados` tiverem placas ou nomes que não podem ficar públicos, confira as regras de acesso do seu plano no GitHub antes de publicar. A base de exemplo do AMBEV SPOT T1 tem só as colunas Identificador, Observação, Data Validação e Motivo.

## Como abrir no seu computador

O navegador bloqueia a leitura das planilhas em `dados` quando o `index.html` é aberto com dois cliques. Para testar localmente, rode na pasta do projeto:

```
python3 -m http.server 8000
```

E abra `http://localhost:8000`. Também dá para abrir o `index.html` direto e usar o botão **Abrir outra planilha**.

## Estrutura

```
index.html            página
css/styles.css        estilos (claro e escuro automático)
js/app.js             clientes, regras, filtros, gráficos, leitura da planilha e PDF
vendor/               SheetJS (ler planilhas), html2canvas e jsPDF (PDF), com as licenças
dados/                uma planilha por cliente
.nojekyll             evita o processamento do Jekyll no GitHub Pages
```
