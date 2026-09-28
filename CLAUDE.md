# PDF Shelf

## Visão geral

O **PDF Shelf** é uma aplicação desktop para organizar, ler e fazer anotações em arquivos PDF localmente.

A aplicação funciona como uma **estante digital de livros**: o usuário importa seus PDFs, organiza sua biblioteca e pode abrir qualquer documento em uma experiência de leitura semelhante à de um livro.

O princípio fundamental do produto é **local-first**:

* Todos os arquivos permanecem na máquina do usuário.
* Nenhum PDF precisa ser enviado para um servidor.
* As informações da biblioteca, progresso de leitura e anotações também devem ser armazenadas localmente.
* A aplicação deve continuar funcionando sem conexão com a internet.

## Objetivos

O produto deve permitir que o usuário:

1. Importe PDFs para sua biblioteca.
2. Mantenha uma cópia própria dos PDFs dentro do armazenamento gerenciado pela aplicação.
3. Visualize todos os PDFs em uma biblioteca semelhante a uma estante.
4. Abra um PDF em uma interface de leitura otimizada.
5. Continue automaticamente a leitura de onde parou.
6. Adicione notas associadas a páginas específicas.
7. Consulte e edite suas notas posteriormente.
8. Gerencie sua biblioteca sem depender de serviços externos.

## Princípios do produto

### Local-first

Os dados pertencem ao usuário e devem permanecer na máquina local.

Não assumir a existência de:

* Backend remoto.
* Conta de usuário.
* Login.
* Sincronização em nuvem.
* Upload de PDFs.
* Serviços externos para armazenamento.

Qualquer funcionalidade futura de sincronização deve ser adicionada posteriormente e não deve ser necessária para o funcionamento básico da aplicação.

### Preservação dos arquivos

Quando o usuário importar um PDF, a aplicação deve **copiar o arquivo para um diretório próprio**, gerenciado pela aplicação.

A aplicação não deve depender do arquivo original continuar no mesmo local.

Exemplo:

```text
Usuário importa:
~/Downloads/livro.pdf

A aplicação copia para:
<app-data>/library/<book-id>/book.pdf
```

Depois da importação, o usuário pode:

* mover o arquivo original;
* renomear o arquivo original;
* apagar o arquivo original;

e a cópia gerenciada pela aplicação continuará disponível.

A aplicação deve trabalhar sempre com sua própria cópia após a importação.

## Biblioteca

A tela principal deve funcionar como uma estante digital.

Cada PDF importado representa um livro/documento.

Cada item da biblioteca deve apresentar, no mínimo:

* Capa ou thumbnail do PDF.
* Título.
* Informações básicas do documento.
* Progresso de leitura.
* Indicação visual caso existam notas.
* Possibilidade de abrir o documento.

O layout deve priorizar uma experiência visual de biblioteca, e não uma simples lista de arquivos.

### Importação

O usuário deve conseguir importar PDFs através de:

* Seletor de arquivos.
* Drag and drop, quando suportado pela plataforma.

Ao importar um PDF:

1. Validar que o arquivo é um PDF.
2. Gerar um identificador único para o livro.
3. Criar o diretório interno do livro.
4. Copiar o PDF para o armazenamento da aplicação.
5. Extrair metadados úteis do PDF.
6. Gerar uma capa/thumbnail para a biblioteca, quando possível.
7. Criar o registro do livro no banco de dados local.
8. Abrir ou disponibilizar o livro na biblioteca.

A importação deve ser resiliente a arquivos grandes e não deve carregar o PDF inteiro na memória desnecessariamente.

## Armazenamento

A aplicação deve separar:

1. **Arquivos binários**

   * PDFs.
   * Thumbnails/capas.
   * Outros assets derivados.

2. **Metadados**

   * Informações dos livros.
   * Progresso de leitura.
   * Notas.
   * Configurações relacionadas à biblioteca.

Uma estrutura conceitual pode ser:

```text
<app-data>/
├── library/
│   ├── <book-id>/
│   │   ├── book.pdf
│   │   └── cover.*
│   │
│   └── <book-id>/
│       ├── book.pdf
│       └── cover.*
│
└── database.*
```

A estrutura física exata pode variar de acordo com a tecnologia escolhida.

O código não deve assumir caminhos fixos específicos do sistema operacional. Usar os diretórios apropriados fornecidos pelo sistema/framework.

## Leitor de PDF

Ao clicar em um livro, o usuário deve entrar em uma experiência de leitura semelhante à leitura de um livro.

O leitor deve:

* Exibir uma página por vez ou uma visualização contínua adequada ao tamanho da tela.
* Permitir navegar entre páginas.
* Permitir avançar e voltar.
* Permitir ir diretamente para uma página.
* Exibir o número da página atual e o total de páginas.
* Permitir zoom.
* Permitir ajustar a visualização ao tamanho da tela.
* Permitir sair do leitor e retornar à biblioteca.

A experiência deve priorizar leitura confortável e reduzir elementos de interface desnecessários.

## Persistência do progresso

A aplicação deve salvar automaticamente a posição de leitura do usuário.

Para cada livro, armazenar pelo menos:

```text
currentPage
```

Opcionalmente, também podemos armazenar:

```text
scrollPosition
zoomLevel
readingMode
```

O comportamento esperado é:

1. Usuário abre um livro.
2. A aplicação identifica a última posição registrada.
3. O leitor abre diretamente nessa posição.
4. Enquanto o usuário lê, a aplicação atualiza o progresso.
5. Ao fechar o livro ou sair do leitor, a posição mais recente deve estar persistida.

O usuário não deve precisar clicar em "Salvar" para preservar seu progresso.

## Notas

O usuário deve poder criar notas associadas a uma página específica do PDF.

Uma nota deve possuir, no mínimo:

```text
id
bookId
pageNumber
content
createdAt
updatedAt
```

Uma página pode possuir múltiplas notas.

Exemplo:

```text
Livro: Clean Code
Página: 42

Nota:
"Revisar este conceito quando estiver trabalhando no módulo de arquitetura."
```

### Comportamento

Dentro do leitor, o usuário deve conseguir:

* Criar uma nota na página atual.
* Visualizar as notas da página atual.
* Editar uma nota existente.
* Excluir uma nota.
* Identificar visualmente quais páginas possuem notas.

As notas devem ser persistidas automaticamente.

### Indicadores

O leitor deve fornecer uma indicação visual quando a página atual possui notas.

Também deve existir uma maneira de localizar rapidamente páginas que possuem anotações.

Uma implementação inicial pode permitir navegar entre páginas anotadas.

## Modelo de dados

O modelo inicial deve ser simples e preparado para evolução.

### Book

```text
Book
├── id
├── title
├── author?
├── filePath
├── coverPath?
├── pageCount
├── currentPage
├── createdAt
├── updatedAt
```

### Note

```text
Note
├── id
├── bookId
├── pageNumber
├── content
├── createdAt
├── updatedAt
```

O modelo pode ser expandido posteriormente para incluir:

* Tags.
* Categorias.
* Favoritos.
* Status de leitura.
* Highlights.
* Bookmarks.
* Metadados adicionais.
* Pesquisa no conteúdo.
* OCR.

Essas funcionalidades não fazem parte do escopo inicial.

## Organização da biblioteca

A primeira versão deve manter a organização simples.

O usuário deve conseguir:

* Importar livros.
* Abrir livros.
* Remover livros da biblioteca.
* Ver seu progresso de leitura.
* Identificar livros com anotações.

Ao remover um livro, a aplicação deve deixar claro que existem duas possibilidades conceituais:

* Remover apenas da biblioteca.
* Remover também a cópia física armazenada pela aplicação.

A implementação deve evitar apagar arquivos sem uma ação explícita do usuário.

## Integridade dos dados

A aplicação deve evitar estados inconsistentes entre o banco de dados e os arquivos físicos.

Por exemplo, não deve existir um livro registrado no banco apontando para um PDF que não existe.

Operações de importação, remoção e atualização devem considerar possíveis falhas no meio da operação.

A aplicação deve lidar adequadamente com:

* PDF corrompido.
* Falha durante a cópia.
* Arquivo sem permissão de leitura.
* Falta de espaço em disco.
* PDF removido ou corrompido dentro do armazenamento da aplicação.
* Interrupção inesperada da aplicação durante uma operação.

## Privacidade

Por padrão, o conteúdo dos livros e das notas deve permanecer local.

Não enviar para servidores:

* PDFs.
* Conteúdo de PDFs.
* Notas.
* Histórico de leitura.
* Metadados pessoais da biblioteca.

Não adicionar analytics, telemetria ou serviços externos sem uma decisão explícita de produto.

## UX

A interface deve ser simples e centrada em três áreas principais:

```text
Biblioteca
    ↓
Livro
    ↓
Leitor
```

### Biblioteca

Foco em descoberta e organização.

### Livro

Foco em informações do documento e progresso.

### Leitor

Foco em leitura, navegação e anotações.

A interface deve evitar excesso de controles visíveis durante a leitura. Ferramentas secundárias podem ficar em barras de ferramentas ou menus que não atrapalhem o conteúdo.

## Arquitetura

A aplicação deve ser estruturada de forma que a lógica de negócio não fique acoplada à interface.

Separar conceitualmente:

```text
UI
│
├── Library
├── Book Details
└── Reader
        │
        ▼
Application Services
│
├── Library Service
├── PDF Service
├── Reading Progress Service
└── Notes Service
        │
        ▼
Persistence
│
├── Local Database
└── Local File Storage
```

A camada de UI não deve manipular diretamente arquivos ou banco de dados sempre que isso puder ser encapsulado por serviços de aplicação.

## Requisitos não funcionais

### Performance

* A biblioteca deve abrir rapidamente mesmo com muitos PDFs.
* Não carregar todos os PDFs completos ao abrir a biblioteca.
* Thumbnails devem ser carregados sob demanda ou de forma eficiente.
* Operações de cópia devem ocorrer de forma assíncrona.
* O leitor deve evitar recarregar o PDF inteiro ao trocar de página.

### Offline

Todas as funcionalidades principais devem funcionar completamente offline.

### Cross-platform

Sempre que possível, utilizar APIs de filesystem e diretórios específicos da plataforma fornecidas pelo framework, evitando caminhos hardcoded.

## Escopo da primeira versão

A primeira versão deve conter somente o necessário para validar o conceito:

### Biblioteca

* Importar PDF.
* Copiar PDF para armazenamento interno.
* Exibir biblioteca.
* Exibir capa/thumbnail.
* Exibir título.
* Remover livro.

### Leitor

* Abrir PDF.
* Navegar entre páginas.
* Zoom.
* Ir para uma página específica.
* Salvar automaticamente a última página.
* Reabrir na última página.

### Anotações

* Criar nota em uma página.
* Editar nota.
* Excluir nota.
* Visualizar notas da página.
* Identificar páginas que possuem notas.

## Fora do escopo inicial

Não implementar na primeira versão:

* Cloud sync.
* Login.
* Conta de usuário.
* Compartilhamento de livros.
* Marketplace.
* Social features.
* OCR.
* Tradução automática.
* AI summarization.
* Highlights avançados.
* Edição do conteúdo do PDF.
* Edição de metadados avançados.
* Sistema complexo de tags.
* DRM.
* Sincronização entre dispositivos.

Essas funcionalidades podem ser consideradas posteriormente, mas não devem aumentar a complexidade da primeira versão.

## Diretrizes para desenvolvimento com IA

A implementação deve priorizar simplicidade, modularidade e código fácil de manter.

Antes de implementar uma funcionalidade:

1. Entender o modelo de dados necessário.
2. Definir onde a lógica deve existir.
3. Evitar duplicação de lógica entre telas.
4. Preferir APIs nativas e bibliotecas maduras.
5. Manter o armazenamento local como fonte de verdade.
6. Não introduzir dependências externas sem necessidade.

Ao adicionar uma nova funcionalidade, verificar se ela afeta:

* Persistência.
* Integridade dos arquivos.
* Progresso de leitura.
* Performance do leitor.
* Compatibilidade entre sistemas operacionais.
* Privacidade dos dados.

## Critério principal de sucesso

O fluxo fundamental do produto deve funcionar de maneira confiável:

```text
Importar PDF
    ↓
PDF é copiado para o armazenamento da aplicação
    ↓
Livro aparece na biblioteca
    ↓
Usuário abre o livro
    ↓
Usuário lê
    ↓
Aplicação salva automaticamente a página atual
    ↓
Usuário adiciona notas às páginas
    ↓
Usuário fecha o livro
    ↓
Usuário abre novamente
    ↓
Livro retorna à última página lida
    ↓
Notas continuam disponíveis
```

Esse fluxo deve ser tratado como o principal caso de uso e permanecer funcional mesmo após reiniciar a aplicação.
