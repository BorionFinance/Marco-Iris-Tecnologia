(() => {
  'use strict';
  const VERSION='2.5.1';
  const SCHEMA=9;
  const SNAP_DISTANCE=8;
  const HISTORY_LIMIT=30;
  const MAX_TEMPLATE_IMAGE_BYTES=5*1024*1024;
  const MAX_TEMPLATE_IMPORT_BYTES=25*1024*1024;
  const MAX_TEMPLATE_EMBEDDED_BYTES=20*1024*1024;
  const DEFAULT_MESSAGE='Olá, {{cliente_nome}}!\n\nSegue em anexo o documento referente à {{osv_codigo}}.\n\nObrigado pela preferência! Qualquer dúvida, fico à disposição.';
  const VARS={
    '{{cliente_nome}}':'Nome do cliente','{{osv_codigo}}':'Código da OSV','{{empresa_nome}}':'Nome da empresa','{{equipamento}}':'Equipamento','{{data}}':'Data atual'
  };
  const PDF_VARS=[
    ['{{empresa.nome}}','Empresa — Nome'],['{{empresa.cnpj}}','Empresa — CNPJ'],['{{empresa.telefone}}','Empresa — Telefone'],['{{empresa.email}}','Empresa — E-mail'],['{{empresa.endereco}}','Empresa — Endereço'],
    ['{{osv.codigo}}','OSV — Código'],['{{osv.data}}','OSV — Data'],['{{osv.status}}','OSV — Status'],['{{osv.problema}}','OSV — Problema'],['{{osv.laudo}}','OSV — Laudo'],['{{osv.servicoRealizado}}','OSV — Serviço realizado'],['{{osv.observacoes}}','OSV — Observações'],['{{osv.desconto}}','Financeiro — Desconto'],['{{osv.total}}','Financeiro — Total'],
    ['{{cliente.nome}}','Cliente — Nome'],['{{cliente.telefone}}','Cliente — Telefone'],['{{cliente.email}}','Cliente — E-mail'],['{{cliente.endereco}}','Cliente — Endereço'],['{{equipamento.nome}}','Equipamento — Nome'],['{{equipamento.marca}}','Equipamento — Marca'],['{{equipamento.modelo}}','Equipamento — Modelo'],['{{equipamento.numeroSerie}}','Equipamento — Número de série'],['{{equipamento.serie}}','Equipamento — Série'],['{{financeiro.subtotal}}','Financeiro — Subtotal'],['{{financeiro.desconto}}','Financeiro — Desconto'],['{{financeiro.total}}','Financeiro — Total'],['{{pagina.numero}}','Sistema — Página atual'],['{{pagina.total}}','Sistema — Total de páginas'],['{{sistema.dataGeracao}}','Sistema — Data de geração']
  ];
  const FIELD_DEFS=[
    ['clientField','Cliente','client-selector',24,24,560,86,280,72,false,true],
    ['equipmentField','Equipamento','equipment-selector',600,24,560,86,250,72,false,true],
    ['openedAtField','Data de abertura','date',24,126,260,76,160,68,false,true],
    ['completedAtField','Data de conclusão','date',300,126,260,76,160,68,false,false],
    ['statusField','Status operacional','select',576,126,280,76,180,68,false,true],
    ['brandModelField','Marca / Modelo','text',872,126,288,76,200,68,false,false],
    ['serialNumberField','Número de série','text',24,218,260,76,180,68,false,false],
    ['accessPasswordField','Senha de acesso','text',300,218,260,76,180,68,false,false],
    ['accessoriesField','Acessórios deixados','text',576,218,584,76,240,68,false,false],
    ['reportedIssueField','Defeito relatado','textarea',24,316,560,150,300,110,true,true],
    ['technicalReportField','Laudo técnico','textarea',600,316,560,150,300,110,true,false],
    ['clientNotesField','Observações para o cliente','textarea',24,482,560,130,300,100,true,false],
    ['internalNotesField','Observação interna','textarea',600,482,560,130,300,100,true,false],
    ['itemsField','Itens e Serviços','dynamic-section',24,634,1136,390,480,240,true,true],
    ['paymentsField','Pagamentos','dynamic-section',24,1046,1136,310,480,220,true,false],
    ['photosField','Fotos','media-section',24,1378,1136,310,300,220,true,false],
    ['actionButtons','Ações finais','actions',24,1710,1136,152,420,120,true,true]
  ];
  const CLIENT_FIELD_DEFS=[
    ['identifier','Identificador do cliente','identifier',16,16,1168,72,220,64,true,true],
    ['name','Nome','text',16,104,1168,82,220,64,true,true],
    ['phone','Telefone','tel',16,202,568,82,180,64,true,false],
    ['document','CPF/CNPJ','text',600,202,584,82,180,64,true,false],
    ['address','Rua / Endereço','text',16,300,760,82,240,64,true,false],
    ['zip','CEP','text',792,300,392,82,160,64,true,false],
    ['addressTools','Busca de endereço e resultados','dynamic-section',16,398,1168,118,300,88,true,false],
    ['number','Número','text',16,532,240,82,140,64,true,false],
    ['city','Cidade','text',272,532,456,82,180,64,true,false],
    ['state','Estado','select',744,532,184,82,120,64,true,false],
    ['neighborhood','Bairro','text',944,532,240,82,160,64,true,false],
    ['complement','Complemento','text',16,630,568,82,180,64,true,false],
    ['notes','Observação interna','textarea',600,630,584,132,260,92,true,false],
    ['actions','Ações do formulário','actions',16,778,1168,92,360,72,true,true]
  ];
  const CLIENT_NODE_SELECTORS={identifier:'.osv-code-preview',name:'.client-name',phone:'[name="phone"]',document:'[name="document"]',address:'[name="address"]',zip:'[name="zip"]',addressTools:'.cep-helper',number:'[name="number"]',city:'.city-large',state:'.state-small',neighborhood:'[name="neighborhood"]',complement:'[name="complement"]',notes:'[name="notes"]',actions:'.form-actions'};
  const PDF_COMPONENT_LIBRARY={
    text:{label:'Texto',width:70,height:12,text:'Novo texto',fontSize:10},
    title:{label:'Título',width:150,height:16,text:'Título do documento',fontSize:18,bold:true},
    subtitle:{label:'Subtítulo',width:150,height:12,text:'Subtítulo',fontSize:12,bold:true},
    line:{label:'Linha',width:170,height:2},
    rect:{label:'Retângulo',width:80,height:30},
    gradient:{label:'Fundo em degradê',width:210,height:297,startColor:'#031a35',endColor:'#137bc2',gradientDirection:'vertical'},
    logo:{label:'Logo principal',width:42,height:24,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true},
    image:{label:'Imagem',width:55,height:35,fit:'contain',lockAspectRatio:true},
    field:{label:'Campo da OSV',width:170,height:12,text:'{{osv.codigo}}',fontSize:10},
    'table-items':{label:'Tabela de itens',width:190,height:65},
    'table-products':{label:'Tabela de produtos',width:190,height:65},
    'table-services':{label:'Tabela de serviços',width:190,height:65},
    'table-payments':{label:'Tabela de pagamentos',width:190,height:55},
    'photos-grid':{label:'Grade de fotos',width:190,height:100,columns:2,perPage:4},
    signature:{label:'Assinatura',width:75,height:28,text:'Assinatura do cliente'},
    'page-number':{label:'Número da página',width:55,height:8,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:8},
    'generation-date':{label:'Data de geração',width:55,height:8,text:'{{sistema.dataGeracao}}',fontSize:8}
  };
  let installed=false;
  let orderLayoutEditor=null;
  let pdfEditor=null;
  let whatsappObserver=null;
  let orderFormObserver=null;
  let clientFormObserver=null;
  const openFormResizeObservers={order:null,client:null};
  const ACTION_INFLIGHT_221=new Set();
  const cloneValue=v=>JSON.parse(JSON.stringify(v));
  const uid=prefix=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const roundGrid=(v,size)=>Math.round(v/size)*size;
  const viewportBand=()=>innerWidth<700?'mobile':innerWidth<1000?'tablet':'desktop';
  const settings=()=>data().settings;
  const activeTemplates=()=>settings().pdfTemplates||[];
  const defaultTemplate=()=>activeTemplates().find(x=>x.id===settings().defaultPdfTemplateId)||activeTemplates().find(x=>x.isDefault)||activeTemplates()[0];
  const escapeRegExp=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  function buildVisualLayout221(definitions,{id,name}){
    let tabletY=16;
    const components=definitions.map((d,index)=>{
      const tabletHeight=Math.max(d[8],Math.min(d[6],260));
      const component={id:d[0],label:d[1],type:d[2],visible:true,locked:false,required:d[10],allowHeight:d[9],minWidth:d[7],minHeight:d[8],desktop:{x:d[3],y:d[4],width:d[5],height:d[6]},tablet:{x:16,y:tabletY,width:736,height:tabletHeight},mobile:{order:index,span:2,height:Math.max(d[8],Math.min(d[6],300))}};
      tabletY+=tabletHeight+16;
      return component;
    });
    return {id,name,schemaVersion:2,layoutSchemaVersion:2,revision:1,gridSize:8,snapEnabled:true,showGrid:false,autoMobile:true,updatedAt:new Date().toISOString(),canvas:{desktopWidth:1200,tabletWidth:768,mobileWidth:393},components};
  }
  function defaultOrderLayout(){return buildVisualLayout221(FIELD_DEFS,{id:'osv-layout-default',name:'Layout padrão da OSV'});}
  function defaultClientLayout(){return buildVisualLayout221(CLIENT_FIELD_DEFS,{id:'client-form-layout-default',name:'Layout padrão do Novo Cliente'});}

  function normalizeVisualLayout221(current,official){
    let changed=false;
    const known=new Map((current.components||[]).map(c=>[c.id,c]));
    current.components=(current.components||[]).filter(c=>official.components.some(x=>x.id===c.id));
    for(const def of official.components){
      let c=known.get(def.id);
      if(!c){c=cloneValue(def);current.components.push(c);changed=true;continue;}
      for(const key of ['label','type','required','allowHeight','minWidth','minHeight'])if(c[key]!==def[key]){c[key]=def[key];changed=true;}
      if(c.required&&c.visible===false){c.visible=true;changed=true;}
      for(const band of ['desktop','tablet']){
        if(!c[band]||!['x','y','width','height'].every(k=>Number.isFinite(Number(c[band][k])))){c[band]=cloneValue(def[band]);changed=true;}
      }
      if(!c.mobile||!Number.isFinite(Number(c.mobile.order))||![1,2].includes(Number(c.mobile.span))||!Number.isFinite(Number(c.mobile.height))){c.mobile=cloneValue(def.mobile);changed=true;}
    }
    current.schemaVersion=2;current.layoutSchemaVersion=2;current.revision=Math.max(1,Number(current.revision)||1);
    current.canvas={...official.canvas,...(current.canvas||{})};
    current.gridSize=Math.max(2,Number(current.gridSize)||8);current.snapEnabled=current.snapEnabled!==false;current.showGrid=!!current.showGrid;current.autoMobile=current.autoMobile!==false;
    return changed;
  }

  function migrateClientLayout221(s){
    const official=defaultClientLayout(),legacy=s.clientFormLayout;
    if(legacy&&Number(legacy.schemaVersion)>=2&&Array.isArray(legacy.components))return normalizeVisualLayout221(legacy,official);
    if(legacy&&Array.isArray(legacy.components))s.clientFormLayoutLegacyBackupV227={migratedAt:new Date().toISOString(),schemaVersion:legacy.schemaVersion||1,layout:cloneValue(legacy)};
    const next=official;
    if(legacy&&Array.isArray(legacy.components)){
      const legacyOrdered=legacy.components.slice().sort((a,b)=>(Number(a.desktop?.order)||0)-(Number(b.desktop?.order)||0));
      const legacyById=new Map(legacyOrdered.map(item=>[item.id,item]));
      // O esquema antigo só descrevia os campos personalizados. Para impedir que os componentes
      // adicionados na v2 ocupem as mesmas coordenadas, todos são refluídos em uma única sequência:
      // primeiro a ordem legada preservada, depois os componentes novos na ordem oficial.
      const orderedIds=[...legacyOrdered.map(item=>item.id),...next.components.map(c=>c.id).filter(id=>!legacyById.has(id))];
      let y=16,col=0,rowHeight=0;
      orderedIds.forEach(id=>{
        const c=next.components.find(x=>x.id===id),old=legacyById.get(id);if(!c)return;
        if(old){c.visible=c.required?true:old.visible!==false;c.locked=!!old.locked;}
        const inferredFull=Number(c.desktop?.width)>=900;
        const span=old?(Number(old.desktop?.span)===1?1:2):(inferredFull?2:1);
        const requestedHeight=old?Number(old.desktop?.height):Number(c.desktop?.height);
        const height=Math.max(c.minHeight,Math.min(600,requestedHeight||c.minHeight));
        if(span===2&&col){y+=rowHeight+16;col=0;rowHeight=0;}
        c.desktop={x:col?600:16,y,width:span===2?1168:568,height};rowHeight=Math.max(rowHeight,height);
        if(span===2){y+=rowHeight+16;col=0;rowHeight=0;}else if(col===0)col=1;else{y+=rowHeight+16;col=0;rowHeight=0;}
        if(old)c.mobile={order:Number.isFinite(Number(old.mobile?.order))?Number(old.mobile.order):c.mobile.order,span:Number(old.mobile?.span)===1?1:2,height:Math.max(c.minHeight,Math.min(600,Number(old.mobile?.height)||height))};
      });
      let tabletY=16;next.components.slice().sort((a,b)=>(a.mobile.order||0)-(b.mobile.order||0)).forEach(c=>{c.tablet={x:16,y:tabletY,width:736,height:Math.max(c.minHeight,Math.min(c.mobile.height||c.desktop.height,360))};tabletY+=c.tablet.height+16;});
      next.revision=2;next.updatedAt=new Date().toISOString();
    }
    const legacyKeys=Object.keys(s.formLayouts||{}).filter(k=>k==='client'||k.startsWith('client:'));
    if(legacyKeys.length){s.clientFormLayoutLegacyGridBackupV227={migratedAt:new Date().toISOString(),entries:Object.fromEntries(legacyKeys.map(k=>[k,cloneValue(s.formLayouts[k])]))};legacyKeys.forEach(k=>delete s.formLayouts[k]);}
    s.clientFormLayout=next;s.migrations=s.migrations||{};s.migrations.clientLayoutV227={completedAt:new Date().toISOString(),targetSchema:2};return true;
  }


  function defaultPdfTemplate(name='Projeto PDF 1',id='pdf-template-default'){
    const now=new Date().toISOString();
    return {
      id,name,description:'Modelo principal com dados, itens, pagamentos e fotos',isDefault:id==='pdf-template-default',version:1,schemaVersion:1,engine:'visual',quality:'standard',createdAt:now,updatedAt:now,
      page:{size:'A4',orientation:'portrait',margins:{top:10,right:10,bottom:10,left:10}},assets:[],versions:[],
      pages:[{id:'page-main',name:'Dados principais',dynamic:false,components:[
        {id:uid('pdfc'),type:'logo',label:'Logo principal',x:10,y:8,width:34,height:20,assetUrl:'assets/marco-symbol.png',locked:false,zIndex:1,opacity:1},
        {id:uid('pdfc'),type:'title',label:'Título',x:50,y:10,width:150,height:12,text:'ORDEM DE SERVIÇO — {{osv.codigo}}',fontSize:18,bold:true,align:'right',color:'#092b52',zIndex:2},
        {id:uid('pdfc'),type:'line',label:'Linha',x:10,y:31,width:190,height:1,color:'#2d72b8',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Empresa',x:10,y:36,width:190,height:20,text:'{{empresa.nome}}\n{{empresa.telefone}} • {{empresa.email}}\n{{empresa.endereco}}',fontSize:9,color:'#26394d',zIndex:1},
        {id:uid('pdfc'),type:'subtitle',label:'Dados do cliente',x:10,y:60,width:190,height:9,text:'DADOS DO CLIENTE',fontSize:12,bold:true,color:'#092b52',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Cliente',x:10,y:71,width:190,height:24,text:'Cliente: {{cliente.nome}}\nTelefone: {{cliente.telefone}}\nEndereço: {{cliente.endereco}}',fontSize:9,zIndex:1},
        {id:uid('pdfc'),type:'subtitle',label:'Equipamento',x:10,y:98,width:190,height:9,text:'EQUIPAMENTO E DIAGNÓSTICO',fontSize:12,bold:true,color:'#092b52',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Diagnóstico',x:10,y:109,width:190,height:52,text:'Equipamento: {{equipamento.nome}}\nMarca / Modelo: {{equipamento.modelo}}\nNúmero de série: {{equipamento.serie}}\nProblema relatado: {{osv.problema}}\nLaudo técnico: {{osv.laudo}}',fontSize:9,zIndex:1,overflow:'next-page'},
        {id:uid('pdfc'),type:'table-items',label:'Tabela de itens',x:10,y:165,width:190,height:58,fontSize:8,overflow:'next-page',hideWhenEmpty:false,zIndex:1},
        {id:uid('pdfc'),type:'table-payments',label:'Tabela de pagamentos',x:10,y:227,width:190,height:34,fontSize:8,overflow:'next-page',hideWhenEmpty:true,zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Totais',x:115,y:264,width:85,height:18,text:'Desconto geral: {{osv.desconto}}\nTotal final: {{osv.total}}',fontSize:11,bold:true,align:'right',zIndex:1},
        {id:uid('pdfc'),type:'generation-date',label:'Data de geração',x:10,y:286,width:70,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:'#647487',zIndex:1},
        {id:uid('pdfc'),type:'page-number',label:'Número da página',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:'#647487',zIndex:1}
      ]},{id:'page-photos',name:'Fotos',dynamic:true,components:[
        {id:uid('pdfc'),type:'title',label:'Fotos',x:10,y:10,width:190,height:12,text:'REGISTRO FOTOGRÁFICO — {{osv.codigo}}',fontSize:16,bold:true,color:'#092b52'},
        {id:uid('pdfc'),type:'photos-grid',label:'Grade de fotos',x:10,y:28,width:190,height:245,columns:2,perPage:4,showCaption:true,hideWhenEmpty:true,overflow:'next-page'},
        {id:uid('pdfc'),type:'page-number',label:'Número da página',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:'#647487'}
      ]}]
    };
  }

  function clonePdfComponent221(c){return {id:uid('pdfc'),locked:false,zIndex:1,opacity:1,...cloneValue(c)};}
  function gradientPdfComponent221(label,startColor,endColor,direction='vertical',zIndex=-100){
    return clonePdfComponent221({type:'gradient',label,x:0,y:0,width:210,height:297,startColor,endColor,gradientDirection:direction,locked:true,zIndex});
  }
  function rectPdfComponent221(label,x,y,width,height,color,zIndex=-20,locked=true){
    return clonePdfComponent221({type:'rect',label,x,y,width,height,color,backgroundColor:color,locked,zIndex});
  }
  function linePdfComponent221(label,x,y,width,color,zIndex=2,strokeWidth=1){
    return clonePdfComponent221({type:'line',label,x,y,width,height:.4,color,zIndex,strokeWidth,locked:true});
  }
  function baseMainComponents221(style){
    const text=style.text||'#17304b',muted=style.muted||'#5f7388',accent=style.accent||'#55b8f0',panel=style.panel||'#f7fbff',titleColor=style.titleColor||'#ffffff';
    const components=[
      gradientPdfComponent221('Fundo azul em degradê',style.gradientStart,style.gradientEnd,style.gradientDirection||'vertical'),
      rectPdfComponent221('Painel principal',8,42,194,238,panel,-40,true),
      rectPdfComponent221('Faixa de destaque',8,42,4,238,accent,-30,true),
      clonePdfComponent221({type:'logo',label:'Logo principal',x:14,y:9,width:28,height:20,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true,zIndex:4}),
      clonePdfComponent221({type:'title',label:'Título da OSV',x:48,y:9,width:148,height:12,text:'ORDEM DE SERVIÇO — {{osv.codigo}}',fontSize:17,bold:true,align:'right',color:titleColor,zIndex:4}),
      clonePdfComponent221({type:'text',label:'Resumo da OSV',x:48,y:23,width:148,height:8,text:'Data: {{osv.data}}  •  Status: {{osv.status}}',fontSize:8.5,bold:true,align:'right',color:style.headerMuted||'#cfeaff',zIndex:4}),
      clonePdfComponent221({type:'text',label:'Dados da empresa',x:14,y:31,width:182,height:8,text:'{{empresa.nome}}  •  {{empresa.telefone}}  •  {{empresa.email}}',fontSize:7.5,align:'center',color:style.headerMuted||'#d7efff',zIndex:4}),
      clonePdfComponent221({type:'subtitle',label:'Título — Cliente',x:15,y:50,width:180,height:8,text:'DADOS DO CLIENTE',fontSize:10.5,bold:true,color:style.sectionColor||style.gradientEnd,zIndex:3}),
      linePdfComponent221('Linha — Cliente',15,58,180,accent,2,.8),
      clonePdfComponent221({type:'text',label:'Dados do cliente',x:15,y:62,width:180,height:23,text:'Cliente: {{cliente.nome}}\nTelefone: {{cliente.telefone}}  •  E-mail: {{cliente.email}}\nEndereço: {{cliente.endereco}}',fontSize:8.2,lineHeight:1.22,color:text,zIndex:3}),
      clonePdfComponent221({type:'subtitle',label:'Título — Equipamento',x:15,y:89,width:180,height:8,text:'EQUIPAMENTO E DIAGNÓSTICO',fontSize:10.5,bold:true,color:style.sectionColor||style.gradientEnd,zIndex:3}),
      linePdfComponent221('Linha — Equipamento',15,97,180,accent,2,.8),
      clonePdfComponent221({type:'text',label:'Equipamento e diagnóstico',x:15,y:101,width:180,height:55,text:'Equipamento: {{equipamento.nome}}\nMarca / Modelo: {{equipamento.modelo}}\nNúmero de série: {{equipamento.numeroSerie}}\nProblema relatado: {{osv.problema}}\nLaudo técnico: {{osv.laudo}}',fontSize:8.2,lineHeight:1.22,color:text,zIndex:3,overflow:'next-page'}),
      clonePdfComponent221({type:'table-items',label:'Itens e serviços',x:15,y:162,width:180,height:64,fontSize:7.6,overflow:'next-page',hideWhenEmpty:false,zIndex:3}),
      rectPdfComponent221('Resumo financeiro',116,232,79,28,style.totalPanel||'#eaf4fb',1,true),
      clonePdfComponent221({type:'text',label:'Totais',x:121,y:237,width:69,height:17,text:'Subtotal: {{financeiro.subtotal}}\nDesconto: {{financeiro.desconto}}\nTOTAL: {{financeiro.total}}',fontSize:9.3,lineHeight:1.18,bold:true,align:'right',color:style.totalColor||style.gradientEnd,zIndex:3}),
      clonePdfComponent221({type:'text',label:'Observações do cliente',x:15,y:234,width:94,height:24,text:'{{osv.observacoes}}',fontSize:7.8,lineHeight:1.2,color:muted,zIndex:3,hideWhenEmpty:true}),
      clonePdfComponent221({type:'generation-date',label:'Data de geração',x:12,y:282,width:90,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true}),
      clonePdfComponent221({type:'page-number',label:'Número da página',x:145,y:282,width:53,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true})
    ];
    if(style.headerBlock)components.splice(1,0,rectPdfComponent221('Cabeçalho sólido',0,0,210,40,style.headerBlock,-60,true));
    if(style.sideGlow)components.splice(3,0,rectPdfComponent221('Detalhe lateral',198,0,12,297,style.sideGlow,-50,true));
    if(style.circuit){
      [[10,6,22],[34,14,18],[152,5,22],[170,19,25],[18,37,30]].forEach((item,index)=>components.push(linePdfComponent221(`Conexão ${index+1}`,item[0],item[1],item[2],accent,-10,.55)));
    }
    return components;
  }
  function basePhotoComponents221(style){
    const accent=style.accent||'#55b8f0',panel=style.panel||'#f7fbff',titleColor=style.titleColor||'#ffffff';
    const components=[
      gradientPdfComponent221('Fundo azul em degradê',style.gradientStart,style.gradientEnd,style.gradientDirection||'vertical'),
      rectPdfComponent221('Painel de fotografias',8,42,194,238,panel,-40,true),
      rectPdfComponent221('Faixa de destaque',8,42,4,238,accent,-30,true),
      clonePdfComponent221({type:'logo',label:'Logo principal',x:14,y:9,width:28,height:20,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true,zIndex:4}),
      clonePdfComponent221({type:'title',label:'Título das fotos',x:48,y:10,width:148,height:12,text:'REGISTRO FOTOGRÁFICO — {{osv.codigo}}',fontSize:15.5,bold:true,align:'right',color:titleColor,zIndex:4}),
      clonePdfComponent221({type:'photos-grid',label:'Grade de fotos',x:15,y:51,width:180,height:218,columns:2,perPage:4,showCaption:true,hideWhenEmpty:true,overflow:'next-page',zIndex:3}),
      clonePdfComponent221({type:'generation-date',label:'Data de geração',x:12,y:282,width:90,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true}),
      clonePdfComponent221({type:'page-number',label:'Número da página',x:145,y:282,width:53,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true})
    ];
    if(style.headerBlock)components.splice(1,0,rectPdfComponent221('Cabeçalho sólido',0,0,210,40,style.headerBlock,-60,true));
    if(style.sideGlow)components.splice(3,0,rectPdfComponent221('Detalhe lateral',198,0,12,297,style.sideGlow,-50,true));
    if(style.circuit){
      [[10,6,22],[34,14,18],[152,5,22],[170,19,25]].forEach((item,index)=>components.push(linePdfComponent221(`Conexão ${index+1}`,item[0],item[1],item[2],accent,-10,.55)));
    }
    return components;
  }
  function createProfessionalPdfTemplate221(style,index){
    const id=`pdf-template-professional-${index+1}`,now=new Date().toISOString();
    return {
      id,name:style.name,description:style.description,designKey:style.key,builtinPackVersion:2,isDefault:false,version:1,schemaVersion:3,engine:'visual',quality:'high',createdAt:now,updatedAt:now,
      page:{size:'A4',orientation:'portrait',margins:{top:8,right:8,bottom:8,left:8}},assets:[],versions:[],
      pages:[
        {id:`${id}-main`,name:'OSV completa',dynamic:false,components:baseMainComponents221(style)},
        {id:`${id}-photos`,name:'Registro fotográfico',dynamic:true,components:basePhotoComponents221(style)}
      ]
    };
  }
  function professionalTemplates221(){
    const standard=defaultPdfTemplate('PDF padrão — Marco Iris','pdf-template-default');
    standard.designKey='standard';standard.description='Modelo padrão original preservado, com dados da OSV, itens, totais e registro fotográfico.';standard.builtinPackVersion=2;standard.schemaVersion=3;standard.isDefault=true;
    const styles=[
      {key:'horizon',name:'Azul Horizonte',description:'Degradê azul vertical, painel claro e leitura elegante para impressão e envio digital.',gradientStart:'#031a35',gradientEnd:'#137bc2',gradientDirection:'vertical',accent:'#70d0ff',panel:'#f8fcff',sectionColor:'#0b5f9f',totalPanel:'#e5f3fc',totalColor:'#074d82'},
      {key:'cobalt',name:'Cobalto Executivo',description:'Degradê horizontal profundo, cabeçalho sólido e acabamento corporativo com alto contraste.',gradientStart:'#07152b',gradientEnd:'#0c619f',gradientDirection:'horizontal',accent:'#8ad8ff',panel:'#f6faff',headerBlock:'#06172c',sectionColor:'#0a558e',totalPanel:'#e8f3fa',totalColor:'#073f6b'},
      {key:'connected',name:'Conexão Digital',description:'Visual tecnológico com degradê azul-escuro, linhas de conexão discretas e conteúdo organizado.',gradientStart:'#010b1d',gradientEnd:'#0a5590',gradientDirection:'vertical',accent:'#61c8ff',panel:'#f5faff',headerBlock:'#03162b',sectionColor:'#075b98',totalPanel:'#e3f2fb',totalColor:'#064676',circuit:true},
      {key:'crystal',name:'Azul Cristal',description:'Degradê azul-claro luminoso, painel branco e tipografia escura para máxima legibilidade.',gradientStart:'#d9f3ff',gradientEnd:'#3e9dd4',gradientDirection:'vertical',accent:'#0c6fae',panel:'#ffffff',titleColor:'#062d50',headerMuted:'#174f76',footerColor:'#073d65',sectionColor:'#0a649f',totalPanel:'#e7f4fb',totalColor:'#064b7b',sideGlow:'#d5f2ff'},
      {key:'technical',name:'Noite Técnica',description:'Degradê azul noturno, detalhes ciano e composição premium para laudos e serviços técnicos.',gradientStart:'#010817',gradientEnd:'#183e61',gradientDirection:'vertical',accent:'#49c7ff',panel:'#f4f9fd',headerBlock:'#020b18',sectionColor:'#075c98',totalPanel:'#dff1fb',totalColor:'#053f6a',circuit:true,sideGlow:'#0d6a9d'}
    ];
    return [standard,...styles.map((style,index)=>createProfessionalPdfTemplate221(style,index+1))];
  }

  function ensureState221(){
    if(!STATE?.dataByProfile)return false;
    let changed=false;
    STATE.schemaVersion=Math.max(SCHEMA,Number(STATE.schemaVersion)||0);
    const defaults=professionalTemplates221();
    Object.values(STATE.dataByProfile).forEach(d=>{
      if(!d||typeof d!=='object')return;
      d.settings=d.settings||{};const s=d.settings;
      if(!s.osvLayout||Number(s.osvLayout.schemaVersion||0)<2){s.osvLayout=defaultOrderLayout();changed=true;}
      else{
        const removed=(s.osvLayout.components||[]).filter(c=>['attachmentsField','pixField'].includes(c.id));
        if(removed.length&&!s.osvLayoutLegacyRemovedComponentsV226)s.osvLayoutLegacyRemovedComponentsV226=cloneValue(removed);
        if(removed.length){s.osvLayout.components=(s.osvLayout.components||[]).filter(c=>!['attachmentsField','pixField'].includes(c.id));changed=true;}
        const official=defaultOrderLayout(),known=new Set((s.osvLayout.components||[]).map(c=>c.id));
        for(const component of official.components)if(!known.has(component.id)){s.osvLayout.components.push(component);changed=true;}
        s.osvLayout.schemaVersion=2;s.osvLayout.layoutSchemaVersion=2;
        s.osvLayout.revision=Math.max(1,Number(s.osvLayout.revision)||1);
      }
      if(migrateLegacyOrderFormLayout221(s))changed=true;
      if(migrateClientLayout221(s))changed=true;
      if(!Array.isArray(s.pdfTemplates)||!s.pdfTemplates.length){s.pdfTemplates=defaults;changed=true;}
      if(Number(s.professionalTemplatePackVersion||0)<2){
        const byId=new Map(s.pdfTemplates.map(t=>[t.id,t]));
        for(const official of defaults){
          const current=byId.get(official.id);
          if(!current){s.pdfTemplates.push(official);byId.set(official.id,official);changed=true;continue;}
          if(official.id==='pdf-template-default')continue; // O PDF padrão do usuário é preservado exatamente como está.
          const untouched=(Number(current.version)||1)<=1&&!(current.versions||[]).length&&(!current.updatedAt||!current.createdAt||current.updatedAt===current.createdAt);
          if(untouched){const replacement=cloneValue(official);Object.keys(current).forEach(k=>delete current[k]);Object.assign(current,replacement);changed=true;}
        }
        s.professionalTemplatePackVersion=2;changed=true;
      }
      if(!s.defaultPdfTemplateId||!s.pdfTemplates.some(x=>x.id===s.defaultPdfTemplateId)){const t=s.pdfTemplates.find(x=>x.isDefault)||s.pdfTemplates[0];s.defaultPdfTemplateId=t.id;t.isDefault=true;changed=true;}
      s.pdfTemplates.forEach(t=>{t.schemaVersion=Math.max(3,Number(t.schemaVersion)||1);t.pages=Array.isArray(t.pages)?t.pages:[];t.versions=Array.isArray(t.versions)?t.versions:[];t.isDefault=t.id===s.defaultPdfTemplateId;for(const page of t.pages){page.components=Array.isArray(page.components)?page.components:[];const legacy=page.components.filter(c=>String(c?.type||'').startsWith('pix-'));if(legacy.length){s.legacyPixPdfComponentsV226=s.legacyPixPdfComponentsV226||[];if(!s.legacyPixPdfComponentsV226.some(x=>x.templateId===t.id&&x.pageId===page.id))s.legacyPixPdfComponentsV226.push({templateId:t.id,pageId:page.id,components:cloneValue(legacy)});page.components=page.components.filter(c=>!String(c?.type||'').startsWith('pix-'));changed=true;}}});
      if(!Array.isArray(s.pixConfigurations)){s.pixConfigurations=[];changed=true;}
      if(s.defaultPixConfigurationId&&!s.pixConfigurations.some(x=>x.id===s.defaultPixConfigurationId)){s.defaultPixConfigurationId=s.pixConfigurations[0]?.id||'';changed=true;}
      s.pixConfigurations.forEach((x,i)=>{x.active=x.active!==false;x.isDefault=x.id===s.defaultPixConfigurationId||(!s.defaultPixConfigurationId&&i===0);});
      if(!s.pdfEditorPreferences||typeof s.pdfEditorPreferences!=='object'){s.pdfEditorPreferences={zoomMode:'fit-page',zoom:1,leftPanelCollapsed:false,rightPanelCollapsed:false,showGrid:false,showGuides:true,viewMode:'page',handTool:false};changed=true;}
      if(typeof s.whatsappMessageTemplate!=='string'||!s.whatsappMessageTemplate.trim()){s.whatsappMessageTemplate=DEFAULT_MESSAGE;changed=true;}
      if(s.personalizationSchemaVersion!==5){s.personalizationSchemaVersion=5;changed=true;}
      s.migrations=s.migrations||{};
      if(!s.migrations.personalizationV224){s.migrations.personalizationV224={completedAt:new Date().toISOString(),source:'2.2.3',target:'2.2.4'};changed=true;}
      (d.serviceOrders||[]).forEach(o=>{if(!o.pdfTemplateId||!s.pdfTemplates.some(t=>t.id===o.pdfTemplateId)){o.pdfTemplateId=s.defaultPdfTemplateId;changed=true;}});
    });
    return changed;
  }

  // Até a 2.2.4 existiam duas persistências para o mesmo layout: settings().osvLayout (editor de
  // Configurações) e settings().formLayouts['order:<faixa>'] (editor legado do modal). Só a primeira
  // continua valendo. A segunda é arquivada em osvLayoutLegacyBackup — nada é apagado antes da cópia.
  const LEGACY_ORDER_LAYOUT_IDS={clientId:'clientField',openedAt:'openedAtField',completedAt:'completedAtField',status:'statusField',equipmentType:'equipmentField',brandModel:'brandModelField',serialNumber:'serialNumberField',accessPassword:'accessPasswordField',accessories:'accessoriesField',reportedIssue:'reportedIssueField',technicalReport:'technicalReportField',clientNotes:'clientNotesField',internalNotes:'internalNotesField'};
  function migrateLegacyOrderFormLayout221(s){
    if(!s.formLayouts||typeof s.formLayouts!=='object')return false;
    const legacyKeys=Object.keys(s.formLayouts).filter(k=>k==='order'||k.startsWith('order:'));
    if(!legacyKeys.length)return false;
    const backup={};legacyKeys.forEach(k=>{backup[k]=cloneValue(s.formLayouts[k]);});
    s.osvLayoutLegacyBackup={migratedAt:new Date().toISOString(),from:'formLayouts',entries:backup};
    // A ordem dos campos do editor legado é preservada na faixa mobile, que também é baseada em ordem.
    // Desktop e tablet usam coordenadas e não têm equivalente no formato antigo, então permanecem intactos.
    const mobileSource=backup['order:mobile']?.fields||backup['order']?.fields;
    if(Array.isArray(mobileSource)){
      let next=0;
      mobileSource.slice().sort((a,b)=>(a.order||0)-(b.order||0)).forEach(item=>{
        const component=s.osvLayout.components.find(c=>c.id===LEGACY_ORDER_LAYOUT_IDS[item.id]);
        if(!component)return;
        component.mobile=component.mobile||{};
        component.mobile.order=next++;
        component.mobile.span=item.span==='full'?2:1;
      });
      s.osvLayout.revision=Math.max(2,(Number(s.osvLayout.revision)||1)+1);
      s.osvLayout.updatedAt=new Date().toISOString();
    }
    legacyKeys.forEach(k=>{delete s.formLayouts[k];});
    return true;
  }

  function renderVariableTemplate(template,order){
    const client=findClient(order?.clientId)||{name:order?.clientName||'cliente',phone:''};
    const map={
      '{{cliente_nome}}':client.name||'cliente','{{osv_codigo}}':order?.id||'OSV','{{empresa_nome}}':company().name||'Marco Iris Soluções em Tecnologia',
      '{{equipamento}}':order?.equipmentType||'equipamento','{{data}}':new Intl.DateTimeFormat('pt-BR').format(new Date())
    };
    return Object.entries(map).reduce((text,[token,value])=>text.split(token).join(value),String(template||DEFAULT_MESSAGE));
  }
  function templatizeMessage(text,order){
    const client=findClient(order?.clientId)||{name:order?.clientName||''};
    let out=String(text||'').trim();
    const replacements=[[client.name,'{{cliente_nome}}'],[order?.id,'{{osv_codigo}}'],[company().name,'{{empresa_nome}}'],[order?.equipmentType,'{{equipamento}}'],[new Intl.DateTimeFormat('pt-BR').format(new Date()),'{{data}}']];
    replacements.filter(x=>x[0]).sort((a,b)=>String(b[0]).length-String(a[0]).length).forEach(([value,token])=>{out=out.replace(new RegExp(escapeRegExp(value),'g'),token);});
    return out||settings().whatsappMessageTemplate||DEFAULT_MESSAGE;
  }

  function personalizationCards(){
    const s=settings(),templates=activeTemplates(),layout=s.osvLayout||defaultOrderLayout(),template=defaultTemplate();
    return `<section class="card full-settings-card personalization-hub-v221"><div class="card-header"><div><h2>Personalização e módulos</h2><p>Layouts, modelos de PDF, mensagem do WhatsApp e preferências visuais.</p></div><span class="badge blue">Editor v${VERSION}</span></div><div class="personalization-cards-v221">
      <article><div class="kpi-icon blue">${icon('grid')}</div><div><strong>Layout da Nova OSV</strong><small>${layout.components.length} componentes · grade ${layout.gridSize}px · ${layout.snapEnabled?'encaixe ativo':'encaixe livre'}</small></div><button class="btn primary compact" data-action="open-osv-layout-editor">Editar layout</button></article>
      <article><div class="kpi-icon blue">${icon('clients')}</div><div><strong>Layout do Novo Cliente</strong><small>Layout fixo e padronizado, seguindo o design do app.</small></div></article>
      <article><div class="kpi-icon orange">${icon('pdf')}</div><div><strong>Modelos de PDF</strong><small>${templates.length} modelo(s) · padrão: ${esc(template?.name||'—')}</small></div><button class="btn primary compact" data-action="open-pdf-templates">Gerenciar modelos</button></article>
      <article><div class="kpi-icon green">${icon('phone')}</div><div><strong>Mensagem padrão do WhatsApp</strong><small>Persistida neste perfil e aplicada com variáveis em cada OSV.</small></div><button class="btn secondary compact" data-action="open-whatsapp-template">Editar mensagem</button></article>
      <article><div class="kpi-icon red">${icon('warning')}</div><div><strong>Restaurar configurações visuais</strong><small>Cria backup antes de restaurar layout e modelo padrão.</small></div><button class="btn danger compact" data-action="restore-personalization-defaults">Restaurar</button></article>
    </div></section>`;
  }

  function activePixConfigurations221(){return (settings().pixConfigurations||[]).filter(x=>x.active!==false);}
  function defaultPixConfiguration221(){return activePixConfigurations221().find(x=>x.id===settings().defaultPixConfigurationId)||activePixConfigurations221()[0]||null;}
  function ensurePixOrderSection221(form){
    form?.querySelectorAll?.('[data-osv-pix-section], .osv-pix-section-v224, [data-action="copy-order-pix"]').forEach(node=>node.remove());
  }
  function snapshotPixFromForm221(form,previous=null){
    return {...(previous&&typeof previous==='object'?cloneValue(previous):{}),enabled:false,savedAt:new Date().toISOString()};
  }


  // Botão compacto que mostra apenas "+", mantendo a ação, o rótulo acessível e o foco por teclado.
  function normalizeInlineAddButton221(button,label){
    if(!button)return null;
    button.type='button';
    button.classList.remove('field-inline-action');
    button.classList.add('btn','secondary','compact','inline-add-button');
    button.innerHTML=icon('plus');
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
    return button;
  }

  function mapOrderNodes(form){
    const getField=name=>form.elements[name]?.closest('.field');
    const sections=[...form.querySelectorAll(':scope > .form-section')];
    return {
      clientField:form.querySelector('.client-picker'),openedAtField:getField('openedAt'),completedAtField:getField('completedAt'),statusField:getField('status'),equipmentField:getField('equipmentType'),brandModelField:getField('brandModel'),serialNumberField:getField('serialNumber'),accessPasswordField:getField('accessPassword'),accessoriesField:getField('accessories'),
      reportedIssueField:getField('reportedIssue'),technicalReportField:getField('technicalReport'),clientNotesField:getField('clientNotes'),internalNotesField:getField('internalNotes'),
      itemsField:sections.find(x=>x.querySelector('#order-items-editor')),paymentsField:sections.find(x=>x.querySelector('#order-payments-editor')),photosField:sections.find(x=>x.querySelector('[data-photo-stage]')),actionButtons:form.querySelector('.osv-form-actions')
    };
  }

  function clientNode221(form,id){
    let node=form.querySelector(CLIENT_NODE_SELECTORS[id]||'__missing__');if(!node)return null;
    if(node.matches('input,textarea,select'))node=node.closest('.field')||node;
    if(id==='phone'){const hint=form.querySelector('[data-phone-hint]');if(hint&&!node.contains(hint))node.appendChild(hint);}
    return node;
  }
  function mapClientNodes221(form){return Object.fromEntries(Object.keys(CLIENT_NODE_SELECTORS).map(id=>[id,clientNode221(form,id)]));}
  // Editor de layout do Novo Cliente desativado a pedido: a tela de cliente agora usa sempre
  // o layout fixo definido em openClientForm (pts-completo.js), sem o motor de posicionamento
  // livre nem o botão "Editar layout". Função mantida como no-op para não quebrar chamadas
  // existentes (observer, resume de rascunho, listeners de resize/evento).
  function hydrateClientForm221(form=document.querySelector('#modal-root form[data-form="client"]')){
    return;
  }
  function watchClientForm221(){
    clientFormObserver?.disconnect?.();const root=document.getElementById('modal-root');if(!root)return;
    clientFormObserver=new MutationObserver(()=>{const form=root.querySelector('form[data-form="client"]');if(form)hydrateClientForm221(form);});
    clientFormObserver.observe(root,{childList:true,subtree:true});
  }

  function hydrateOrderForm221(){
    const form=document.querySelector('#modal-root form[data-form="order"]');if(!form||form.dataset.personalized221==='1')return;
    form.dataset.personalized221='1';
    normalizeInlineAddButton221(form.querySelector('[data-action="new-client-from-order"]'),'Adicionar novo cliente');
    const equipButton=form.querySelector('[data-action="new-equipment-type"]');
    normalizeInlineAddButton221(equipButton,'Adicionar novo tipo de equipamento');
    // O botão "+" do tipo precisa ficar ao lado do seletor, nunca em uma linha própria abaixo dele.
    const equipSelect=form.elements.equipmentType;
    if(equipButton&&equipSelect&&!equipButton.closest('.inline-add-row')){
      const row=document.createElement('div');row.className='inline-add-row';
      equipSelect.before(row);row.appendChild(equipSelect);row.appendChild(equipButton);
      equipSelect.closest('.field')?.classList.add('equipment-type-field');
    }
    const preview=form.querySelector('.osv-code-preview');
    if(preview&&!preview.querySelector('[data-pdf-template-select]')){
      const order=form.dataset.id?findOrder(form.dataset.id):null,selected=order?.pdfTemplateId||settings().defaultPdfTemplateId;
      preview.insertAdjacentHTML('beforeend',`<label class="osv-template-picker-v221"><span>Modelo do PDF</span><select name="pdfTemplateId" data-pdf-template-select>${activeTemplates().map(t=>`<option value="${attr(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}${t.id===settings().defaultPdfTemplateId?' — Padrão':''}</option>`).join('')}</select></label>`);
    }
    ensurePixOrderSection221(form);
    const nodes=mapOrderNodes(form),surface=document.createElement('div');surface.className='osv-custom-layout-surface-v221';surface.dataset.layoutSurface='order';
    const firstGrid=form.querySelector('.order-general');firstGrid?.before(surface);
    Object.entries(nodes).forEach(([id,node])=>{if(!node)return;node.dataset.osvComponent=id;if(id!=='actionButtons')surface.appendChild(node);});
    if(nodes.actionButtons)surface.after(nodes.actionButtons);
    form.querySelectorAll(':scope > .form-grid').forEach(g=>{if(!g.children.length)g.remove();});
    applyOrderLayout221(form);
  }

  function watchOrderForm221(){
    orderFormObserver?.disconnect?.();
    const root=document.getElementById('modal-root');if(!root)return;
    orderFormObserver=new MutationObserver(()=>{
      const form=root.querySelector('form[data-form="order"]');
      if(form&&form.dataset.personalized221!=='1')hydrateOrderForm221();
    });
    orderFormObserver.observe(root,{childList:true,subtree:true});
  }

  function applyVisualSurfaceLayout221(surface,layout,attribute,entity){
    if(!surface)return;const band=layout.autoMobile?viewportBand():'desktop';surface.dataset.band=band;surface.classList.toggle('show-grid',!!layout.showGrid);surface.style.setProperty('--layout-grid',`${layout.gridSize||8}px`);
    const selector=id=>`[${attribute}="${CSS.escape(id)}"]`;
    layout.components.forEach(c=>{const el=surface.querySelector(selector(c.id));if(!el)return;const hidden=c.visible===false;el.hidden=hidden;if(hidden)el.style.setProperty('display','none','important');else el.style.removeProperty('display');});
    const components=layout.components.filter(c=>c.visible!==false);
    const growsWithContent=c=>entity==='order'&&['dynamic-section','media-section'].includes(c.type);
    if(band==='mobile'){
      openFormResizeObservers[entity]?.disconnect?.();openFormResizeObservers[entity]=null;
      surface.style.height='auto';surface.style.width='100%';surface.classList.add('responsive-flow');
      components.slice().sort((a,b)=>(a.mobile?.order??0)-(b.mobile?.order??0)).forEach(c=>{const el=surface.querySelector(selector(c.id));if(!el)return;const fluid=growsWithContent(c);el.hidden=false;el.style.cssText='';el.style.order=String(c.mobile?.order??0);el.style.gridColumn=`span ${clamp(Number(c.mobile?.span)||2,1,2)}`;el.style.minHeight=`${Math.max(c.minHeight||44,c.mobile?.height||0)}px`;el.style.height=fluid?'auto':(c.allowHeight&&c.mobile?.height?`${Math.max(c.minHeight||44,c.mobile.height)}px`:'auto');el.style.maxHeight=fluid?'none':'';el.style.overflow=fluid?'visible':(c.allowHeight?'auto':'visible');});
    }else{
      surface.classList.remove('responsive-flow');const key=band==='tablet'?'tablet':'desktop',canvasWidth=key==='tablet'?(layout.canvas?.tabletWidth||768):(layout.canvas?.desktopWidth||1200);surface.style.width='100%';surface.dataset.canvasWidth=String(canvasWidth);
      components.forEach(c=>{const p=c[key]||c.desktop,el=surface.querySelector(selector(c.id));if(!el)return;const fluid=growsWithContent(c);el.hidden=false;el.style.cssText='';el.style.position='absolute';el.style.left=`${(p.x/canvasWidth)*100}%`;el.style.top=`${p.y}px`;el.style.width=`${(p.width/canvasWidth)*100}%`;el.style.minWidth='0';el.style.minHeight=`${Math.max(c.minHeight||44,p.height||0)}px`;el.style.height=fluid?'auto':(c.allowHeight&&p.height?`${p.height}px`:'auto');el.style.maxHeight=fluid?'none':'';el.style.overflow=fluid?'visible':(c.allowHeight&&p.height?'auto':'visible');});
      requestAnimationFrame(()=>reflowVisualSurface221(surface,components,key,canvasWidth,attribute));
      openFormResizeObservers[entity]?.disconnect?.();openFormResizeObservers[entity]=new ResizeObserver(()=>reflowVisualSurface221(surface,components,key,canvasWidth,attribute));components.forEach(c=>{const el=surface.querySelector(selector(c.id));if(el)openFormResizeObservers[entity].observe(el);});
    }
  }
  function reflowVisualSurface221(surface,components,key,canvasWidth,attribute){
    if(!surface?.isConnected||surface.classList.contains('responsive-flow'))return;const selector=id=>`[${attribute}="${CSS.escape(id)}"]`;
    const sorted=components.map(c=>({c,p:c[key]||c.desktop,el:surface.querySelector(selector(c.id))})).filter(x=>x.el).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
    const rows=[];sorted.forEach(item=>{let row=rows.find(r=>Math.abs(r.sourceY-item.p.y)<=14);if(!row){row={sourceY:item.p.y,items:[]};rows.push(row);}row.items.push(item);});rows.sort((a,b)=>a.sourceY-b.sourceY);
    let cursor=16,previousSource=0,previousDeclared=0;rows.forEach((row,index)=>{const sourceGap=index?Math.max(12,row.sourceY-previousSource-previousDeclared):Math.max(0,row.sourceY-16);cursor+=sourceGap;let rowHeight=0;row.items.forEach(item=>{item.el.style.top=`${cursor}px`;item.el.style.left=`${(item.p.x/canvasWidth)*100}%`;item.el.style.width=`${(item.p.width/canvasWidth)*100}%`;rowHeight=Math.max(rowHeight,item.el.scrollHeight,item.el.offsetHeight,item.p.height||0);});previousSource=row.sourceY;previousDeclared=Math.max(...row.items.map(x=>x.p.height||0));cursor+=rowHeight;});surface.style.height=`${Math.max(260,cursor+24)}px`;
  }
  function applyOrderLayout221(form){applyVisualSurfaceLayout221(form?.querySelector('[data-layout-surface="order"]'),settings().osvLayout||defaultOrderLayout(),'data-osv-component','order');}
  function applyClientLayout221(form=document.querySelector('#modal-root form[data-form="client"]')){applyVisualSurfaceLayout221(form?.querySelector('[data-layout-surface="client"]'),settings().clientFormLayout||defaultClientLayout(),'data-client-component','client');}


  function layoutConfig221(entity='order'){
    return entity==='client'?{entity:'client',settingsKey:'clientFormLayout',title:'Editor de layout do Novo Cliente',defaultLayout:defaultClientLayout,event:'client-form-layout-updated',audit:'Layout do Novo Cliente salvo',backup:'antes-salvar-layout-cliente-v2.2.13',resetPrompt:'Restaurar o layout padrão do Novo Cliente? O layout atual ficará disponível para desfazer até salvar.',resume:ticket=>window.MarcoClientFormBridge?.resume?.(ticket)}:{entity:'order',settingsKey:'osvLayout',title:'Editor de layout da Nova OSV',defaultLayout:defaultOrderLayout,event:'service-order-layout-updated',audit:'Layout da Nova OSV salvo',backup:'antes-salvar-layout-osv-v2.2.13',resetPrompt:'Restaurar o layout padrão da Nova OSV? O layout atual ficará disponível para desfazer até salvar.',resume:resumeOrderForm221};
  }
  function currentLayoutConfig221(){return layoutConfig221(orderLayoutEditor?.entity||'order');}
  function layoutForEditor(entity='order'){const cfg=layoutConfig221(entity);return cloneValue(settings()[cfg.settingsKey]||cfg.defaultLayout());}
  function pushLayoutHistory(){if(!orderLayoutEditor)return;orderLayoutEditor.history.push(cloneValue(orderLayoutEditor.layout));if(orderLayoutEditor.history.length>HISTORY_LIMIT)orderLayoutEditor.history.shift();orderLayoutEditor.future=[];}
  function selectedLayoutComponents(){return orderLayoutEditor?.layout.components.filter(c=>orderLayoutEditor.selected.has(c.id))||[];}
  function editorPosition(c){const view=orderLayoutEditor.view;if(view==='mobile'){const width=orderLayoutEditor.layout.canvas.mobileWidth||393,span=c.mobile?.span||2;return {x:span===1?8:8,y:16+(c.mobile?.order||0)*96,width:span===1?(width-24)/2:width-16,height:c.mobile?.height||Math.max(c.minHeight,74)};}return c[view]||c.desktop;}
  function setEditorPosition(c,p){const view=orderLayoutEditor.view;if(view==='mobile'){c.mobile=c.mobile||{};c.mobile.order=Math.max(0,Math.round((p.y-16)/96));c.mobile.span=p.width<(orderLayoutEditor.layout.canvas.mobileWidth||393)*.75?1:2;c.mobile.height=Math.max(c.minHeight||44,p.height);return;}c[view]={...c[view],...p};}

  // Ponto de entrada único do editor de layout da Nova OSV.
  // Chamado por Configurações → Personalização → Layout da Nova OSV e por Nova OSV → Editar layout.
  // returnTo é o bilhete de volta para a OSV que estava aberta (null quando vem das Configurações).
  function openVisualLayoutEditor221(entity='order',returnTo=null){
    const cfg=layoutConfig221(entity);orderLayoutEditor={entity,layout:layoutForEditor(entity),selected:new Set(),view:viewportBand(),history:[],future:[],dirty:false,preview:false,interaction:null,multiSelect:false,backupCreated:false,returnTo};
    openModal(cfg.title,`<div class="layout-editor-v221" data-layout-editor-entity="${attr(entity)}"><div class="layout-toolbar-v221">
      <button class="btn secondary compact" data-action="layout-undo" disabled>Desfazer</button><button class="btn secondary compact" data-action="layout-redo" disabled>Refazer</button>
      <button class="btn ghost compact" data-action="layout-toggle-grid">Exibir grade</button><button class="btn ghost compact active" data-action="layout-toggle-snap">Encaixe automático</button>
      <button class="btn ghost compact" data-action="layout-toggle-multi" aria-pressed="false">Selecionar vários</button><button class="btn ghost compact" data-action="layout-lock-all">Bloquear todos</button><button class="btn ghost compact" data-action="layout-unlock-all">Desbloquear todos</button>
      <div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="layout-align" data-align="left">Esquerda</button><button class="btn ghost compact" data-action="layout-align" data-align="center">Centro H</button><button class="btn ghost compact" data-action="layout-align" data-align="right">Direita</button><button class="btn ghost compact" data-action="layout-align" data-align="top">Topo</button><button class="btn ghost compact" data-action="layout-align" data-align="middle">Centro V</button><button class="btn ghost compact" data-action="layout-align" data-align="bottom">Embaixo</button></div><div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="layout-distribute" data-axis="horizontal">Distribuir H</button><button class="btn ghost compact" data-action="layout-distribute" data-axis="vertical">Distribuir V</button></div>
      <div class="segmented-v221"><button class="active" data-action="layout-view" data-view="desktop">Desktop</button><button data-action="layout-view" data-view="tablet">Tablet</button><button data-action="layout-view" data-view="mobile">Mobile</button></div>
      <button class="btn ghost compact" data-action="layout-preview">Visualizar formulário</button>
    </div><div class="layout-workspace-v221"><div class="layout-canvas-scroll-v221"><div class="layout-canvas-v221" data-layout-editor-canvas><div class="layout-guide-v221 vertical" data-guide-x hidden></div><div class="layout-guide-v221 horizontal" data-guide-y hidden></div></div></div><aside class="layout-properties-v221" data-layout-properties><div class="empty compact-empty">Selecione um campo para editar posição, tamanho e bloqueio.</div></aside></div><footer class="editor-footer-v221"><button class="btn danger" data-action="layout-reset">Restaurar padrão</button><span class="muted" data-layout-validation>Layout ainda não alterado.</span><div><button class="btn secondary" data-action="layout-cancel">Cancelar</button><button class="btn primary" data-action="layout-save">Salvar alterações</button></div></footer></div>`,true);
    requestAnimationFrame(()=>{document.querySelector('#modal-root .modal')?.classList.add('visual-layout-modal-v227',`${entity}-layout-modal-v227`);renderOrderLayoutEditor221();});
  }
  function openOrderLayoutEditor221(returnTo=null){openVisualLayoutEditor221('order',returnTo);}
  function openClientLayoutEditor221(returnTo=null){openVisualLayoutEditor221('client',returnTo);}

  function renderOrderLayoutEditor221(){
    if(!orderLayoutEditor)return;const canvas=document.querySelector('[data-layout-editor-canvas]');if(!canvas)return;const l=orderLayoutEditor.layout,view=orderLayoutEditor.view,width=view==='mobile'?(l.canvas.mobileWidth||393):view==='tablet'?(l.canvas.tabletWidth||768):(l.canvas.desktopWidth||1200);
    canvas.style.width=`${width}px`;canvas.style.height=`${Math.max(700,...l.components.map(c=>{const p=editorPosition(c);return p.y+p.height+60;}))}px`;canvas.classList.toggle('show-grid',!!l.showGrid);canvas.classList.toggle('preview-mode',!!orderLayoutEditor.preview);canvas.style.setProperty('--layout-grid',`${l.gridSize||8}px`);
    canvas.querySelectorAll('.layout-component-v221').forEach(x=>x.remove());
    l.components.filter(c=>c.visible!==false).sort((a,b)=>(editorPosition(a).y-editorPosition(b).y)||(editorPosition(a).x-editorPosition(b).x)).forEach(c=>{
      const p=editorPosition(c),el=document.createElement('article');el.className=`layout-component-v221 ${orderLayoutEditor.selected.has(c.id)?'selected':''} ${c.locked?'locked':''}`;el.dataset.componentId=c.id;el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.width=`${p.width}px`;el.style.height=`${p.height}px`;el.tabIndex=0;el.innerHTML=`<div class="layout-component-drag-v221"><strong>${esc(c.label)}</strong><small>${Math.round(p.width)} × ${Math.round(p.height)} · X ${Math.round(p.x)} · Y ${Math.round(p.y)}</small>${c.required?'<span>Obrigatório</span>':''}${c.locked?'<b>Bloqueado</b>':''}</div><div class="layout-demo-field-v221">${c.type.includes('section')||c.type==='actions'?`<div>${esc(c.label)}</div><div class="demo-lines-v221"></div>`:`<label>${esc(c.label)}</label><div class="demo-input-v221"></div>`}</div>${orderLayoutEditor.preview?'':resizeHandlesHtml(c)}`;canvas.appendChild(el);
    });
    renderLayoutProperties221();updateLayoutToolbar221();
  }
  function updateLayoutComponentVisual221(c){
    const el=document.querySelector(`[data-component-id="${CSS.escape(c.id)}"]`);if(!el)return;const p=editorPosition(c);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.width=`${p.width}px`;el.style.height=`${p.height}px`;el.classList.toggle('selected',orderLayoutEditor.selected.has(c.id));el.classList.toggle('locked',!!c.locked);const small=el.querySelector('.layout-component-drag-v221 small');if(small)small.textContent=`${Math.round(p.width)} × ${Math.round(p.height)} · X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
  }
  function resizeHandlesHtml(c){if(c.locked)return '';const dirs=c.allowHeight?['n','s','e','w','ne','nw','se','sw']:['e','w'];return dirs.map(d=>`<i class="resize-handle-v221 ${d}" data-resize-dir="${d}"></i>`).join('');}
  function pdfResizeHandlesHtml221(c){if(c.locked)return '';return ['n','s','e','w','ne','nw','se','sw'].map(d=>`<i class="resize-handle-v221 ${d}" data-pdf-resize="${d}"></i>`).join('');}
  function renderLayoutProperties221(){const panel=document.querySelector('[data-layout-properties]'),selected=selectedLayoutComponents();if(!panel)return;if(!selected.length){panel.innerHTML='<div class="empty compact-empty">Selecione um campo. Use Ctrl/Shift para selecionar vários.</div>';return;}if(selected.length>1){panel.innerHTML=`<h3>${selected.length} campos selecionados</h3><button class="btn secondary full" data-action="layout-lock-selected">${selected.every(c=>c.locked)?'Desbloquear':'Bloquear'} selecionados</button><button class="btn secondary full" data-action="layout-equal-width">Igualar largura</button><button class="btn secondary full" data-action="layout-equal-height">Igualar altura</button>`;return;}const c=selected[0],p=editorPosition(c);panel.innerHTML=`<h3>${esc(c.label)}</h3><p class="muted">${esc(c.id)} · ${esc(c.type)}</p><div class="property-grid-v221"><label>X<input type="number" data-layout-prop="x" value="${Math.round(p.x)}"></label><label>Y<input type="number" data-layout-prop="y" value="${Math.round(p.y)}"></label><label>Largura<input type="number" data-layout-prop="width" min="${c.minWidth}" value="${Math.round(p.width)}"></label><label>Altura<input type="number" data-layout-prop="height" min="${c.minHeight}" value="${Math.round(p.height)}" ${c.allowHeight?'':'disabled'}></label></div><label class="list-row compact"><div class="list-row-main"><strong>Bloquear posição</strong></div><input type="checkbox" data-layout-prop-check="locked" ${c.locked?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Visível</strong></div><input type="checkbox" data-layout-prop-check="visible" ${c.visible!==false?'checked':''} ${c.required?'disabled':''}></label>${orderLayoutEditor.view==='mobile'?`<label class="field"><span>Largura no mobile</span><select data-layout-mobile-span><option value="2" ${c.mobile?.span!==1?'selected':''}>Largura total</option><option value="1" ${c.mobile?.span===1?'selected':''}>Meia largura</option></select></label>`:''}`;}
  function updateLayoutToolbar221(){const root=document.querySelector('.layout-editor-v221');if(!root)return;root.querySelector('[data-action="layout-undo"]').disabled=!orderLayoutEditor.history.length;root.querySelector('[data-action="layout-redo"]').disabled=!orderLayoutEditor.future.length;root.querySelector('[data-action="layout-toggle-grid"]').classList.toggle('active',!!orderLayoutEditor.layout.showGrid);root.querySelector('[data-action="layout-toggle-snap"]').classList.toggle('active',!!orderLayoutEditor.layout.snapEnabled);const multi=root.querySelector('[data-action="layout-toggle-multi"]');if(multi){multi.classList.toggle('active',!!orderLayoutEditor.multiSelect);multi.setAttribute('aria-pressed',String(!!orderLayoutEditor.multiSelect));}root.querySelectorAll('[data-action="layout-view"]').forEach(b=>b.classList.toggle('active',b.dataset.view===orderLayoutEditor.view));const status=root.querySelector('[data-layout-validation]');if(status)status.textContent=orderLayoutEditor.dirty?'Alterações não salvas.':'Layout ainda não alterado.';}

  function selectLayoutComponent221(id,event,shouldRender=true){if(!orderLayoutEditor)return;const modifier=event.ctrlKey||event.metaKey||event.shiftKey,additive=modifier||orderLayoutEditor.multiSelect;if(!additive)orderLayoutEditor.selected.clear();if((event.ctrlKey||event.metaKey)&&orderLayoutEditor.selected.has(id))orderLayoutEditor.selected.delete(id);else orderLayoutEditor.selected.add(id);if(shouldRender)renderOrderLayoutEditor221();}
  function snapPosition221(component,next,mode){const l=orderLayoutEditor.layout,view=orderLayoutEditor.view;if(!l.snapEnabled)return next;const grid=l.gridSize||8,nextOut={...next};nextOut.x=roundGrid(nextOut.x,grid);nextOut.y=roundGrid(nextOut.y,grid);nextOut.width=roundGrid(nextOut.width,grid);nextOut.height=roundGrid(nextOut.height,grid);const width=view==='mobile'?l.canvas.mobileWidth:view==='tablet'?l.canvas.tabletWidth:l.canvas.desktopWidth;const xTargets=[0,width/2,width],yTargets=[0],excluded=new Set(orderLayoutEditor.interaction?.starts?.map(x=>x.id)||[component.id]);l.components.filter(c=>!excluded.has(c.id)&&c.visible!==false).forEach(c=>{const p=editorPosition(c);xTargets.push(p.x,p.x+p.width,p.x+p.width/2);yTargets.push(p.y,p.y+p.height,p.y+p.height/2);});const edgesX=[nextOut.x,nextOut.x+nextOut.width,nextOut.x+nextOut.width/2],edgesY=[nextOut.y,nextOut.y+nextOut.height,nextOut.y+nextOut.height/2];let sx=null,sy=null;for(const t of xTargets)for(let i=0;i<edgesX.length;i++)if(Math.abs(edgesX[i]-t)<=SNAP_DISTANCE){const delta=t-edgesX[i];if(mode!=='resize'||i===0)nextOut.x+=delta;else if(i===1)nextOut.width+=delta;else nextOut.x+=delta; sx=t;break;}for(const t of yTargets)for(let i=0;i<edgesY.length;i++)if(Math.abs(edgesY[i]-t)<=SNAP_DISTANCE){const delta=t-edgesY[i];if(mode!=='resize'||i===0)nextOut.y+=delta;else if(i===1)nextOut.height+=delta;else nextOut.y+=delta;sy=t;break;}showGuides221(sx,sy);return nextOut;}
  function showGuides221(x,y){const gx=document.querySelector('[data-guide-x]'),gy=document.querySelector('[data-guide-y]');if(gx){gx.hidden=x===null;gx.style.left=`${x||0}px`;}if(gy){gy.hidden=y===null;gy.style.top=`${y||0}px`;}}
  function startLayoutInteraction221(event,el,dir=''){if(!orderLayoutEditor||orderLayoutEditor.preview)return;const c=orderLayoutEditor.layout.components.find(x=>x.id===el.dataset.componentId);if(!c||c.locked)return;event.preventDefault();if(!orderLayoutEditor.selected.has(c.id)){orderLayoutEditor.selected.clear();orderLayoutEditor.selected.add(c.id);}pushLayoutHistory();const p=cloneValue(editorPosition(c)),starts=!dir?selectedLayoutComponents().filter(x=>!x.locked).map(x=>({id:x.id,p:cloneValue(editorPosition(x))})):null;orderLayoutEditor.interaction={id:c.id,dir,startX:event.clientX,startY:event.clientY,start:p,starts};try{el.setPointerCapture?.(event.pointerId);}catch(_){}orderLayoutEditor.dirty=true;}
  function moveLayoutInteraction221(event){const it=orderLayoutEditor?.interaction;if(!it)return;const c=orderLayoutEditor.layout.components.find(x=>x.id===it.id),rawDx=event.clientX-it.startX,rawDy=event.clientY-it.startY,width=orderLayoutEditor.view==='mobile'?orderLayoutEditor.layout.canvas.mobileWidth:orderLayoutEditor.view==='tablet'?orderLayoutEditor.layout.canvas.tabletWidth:orderLayoutEditor.layout.canvas.desktopWidth;if(!it.dir&&it.starts?.length>1){const bounds={minX:Math.min(...it.starts.map(x=>x.p.x)),minY:Math.min(...it.starts.map(x=>x.p.y)),maxX:Math.max(...it.starts.map(x=>x.p.x+x.p.width))};let dx=clamp(rawDx,-bounds.minX,width-bounds.maxX),dy=Math.max(rawDy,-bounds.minY);let anchor={...it.start,x:it.start.x+dx,y:it.start.y+dy};anchor=snapPosition221(c,anchor,'move');dx=anchor.x-it.start.x;dy=anchor.y-it.start.y;it.starts.forEach(item=>{const target=orderLayoutEditor.layout.components.find(x=>x.id===item.id);if(!target)return;const p={...item.p,x:item.p.x+dx,y:item.p.y+dy};setEditorPosition(target,p);updateLayoutComponentVisual221(target);});updateLayoutToolbar221();return;}let p={...it.start};if(it.dir){if(it.dir.includes('e'))p.width=it.start.width+rawDx;if(it.dir.includes('s'))p.height=it.start.height+rawDy;if(it.dir.includes('w')){p.x=it.start.x+rawDx;p.width=it.start.width-rawDx;}if(it.dir.includes('n')){p.y=it.start.y+rawDy;p.height=it.start.height-rawDy;}}else{p.x=it.start.x+rawDx;p.y=it.start.y+rawDy;}p.width=clamp(p.width,c.minWidth||100,Math.max(c.minWidth||100,width-p.x));p.height=clamp(p.height,c.minHeight||44,900);p.x=clamp(p.x,0,Math.max(0,width-p.width));p.y=Math.max(0,p.y);p=snapPosition221(c,p,it.dir?'resize':'move');p.width=clamp(p.width,c.minWidth||100,width);p.height=clamp(p.height,c.minHeight||44,900);p.x=clamp(p.x,0,Math.max(0,width-p.width));p.y=Math.max(0,p.y);setEditorPosition(c,p);updateLayoutComponentVisual221(c);updateLayoutToolbar221();}
  function endLayoutInteraction221(){if(!orderLayoutEditor?.interaction)return;orderLayoutEditor.interaction=null;showGuides221(null,null);if(orderLayoutEditor.view==='mobile'){orderLayoutEditor.layout.components.sort((a,b)=>(a.mobile?.order||0)-(b.mobile?.order||0)).forEach((c,i)=>{c.mobile.order=i;});}renderOrderLayoutEditor221();}

  function validateLayout221(layout){
    const issues=[];
    for(const c of layout.components){
      if(c.required&&c.visible===false)issues.push(`${c.label} é obrigatório.`);
      for(const key of ['desktop','tablet']){
        const p=c[key],max=key==='desktop'?layout.canvas.desktopWidth:layout.canvas.tabletWidth;
        if(!p){issues.push(`${c.label} não possui configuração para ${key}.`);continue;}
        const values=[p.x,p.y,p.width,p.height].map(Number);
        if(!values.every(Number.isFinite)){issues.push(`${c.label} possui medidas inválidas em ${key}.`);continue;}
        if(p.x<0||p.y<0||p.x+p.width>max+1)issues.push(`${c.label} está fora da área ${key}.`);
        if(p.width<(c.minWidth||0)-1||p.height<(c.minHeight||0)-1)issues.push(`${c.label} está menor que o limite mínimo.`);
      }
      const mobile=c.mobile||{};
      if(!Number.isFinite(Number(mobile.order))||![1,2].includes(Number(mobile.span))||!Number.isFinite(Number(mobile.height))||Number(mobile.height)<(c.minHeight||44)-1)issues.push(`${c.label} possui configuração mobile inválida.`);
    }
    for(const key of ['desktop','tablet']){
      const visible=layout.components.filter(c=>c.visible!==false&&c[key]);
      for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
        const a=visible[i][key],b=visible[j][key],overlapW=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),overlapH=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
        if(overlapW>8&&overlapH>8)issues.push(`${visible[i].label} está sobrepondo ${visible[j].label} em ${key}.`);
      }
    }
    return [...new Set(issues)];
  }
  async function saveOrderLayout221(){
    const cfg=currentLayoutConfig221(),issues=validateLayout221(orderLayoutEditor.layout);if(issues.length){toast(issues[0],'error');return;}
    if(orderLayoutEditor.dirty&&!orderLayoutEditor.backupCreated){await MarcoStorage.createBackup(STATE,cfg.backup);orderLayoutEditor.backupCreated=true;}
    const stored=settings()[cfg.settingsKey],previousRevision=Math.max(Number(stored?.revision)||0,Number(orderLayoutEditor.layout?.revision)||0),next=cloneValue(orderLayoutEditor.layout);next.layoutId=next.layoutId||next.id||`${cfg.entity}-layout-default`;next.schemaVersion=2;next.layoutSchemaVersion=2;next.revision=Math.max(2,previousRevision+1);next.updatedAt=new Date().toISOString();
    const previousLayout=cloneValue(stored||cfg.defaultLayout());settings()[cfg.settingsKey]=next;
    try{await persist(cfg.audit,`${next.components.length} componentes · revisão ${next.revision}`);}catch(e){settings()[cfg.settingsKey]=previousLayout;console.error(`Falha ao salvar ${cfg.audit}:`,e);const status=document.querySelector('[data-layout-validation]');if(status)status.textContent='Não foi possível salvar. As alterações continuam nesta tela.';toast('Não foi possível salvar o layout. Suas alterações continuam aqui.','error');return;}
    window.dispatchEvent(new CustomEvent(cfg.event,{detail:{layoutId:next.layoutId,revision:next.revision,updatedAt:next.updatedAt}}));const ticket=orderLayoutEditor.returnTo,entity=cfg.entity;orderLayoutEditor=null;closeModal();const resumed=!!cfg.resume?.(ticket);if(!resumed)renderView();toast(entity==='client'?'Layout do Novo Cliente salvo e aplicado.':'Layout da Nova OSV salvo e aplicado.');
  }


  function resumeOrderForm221(ticket){
    if(!ticket)return false;
    return !!window.MarcoOrderFormBridge?.resume?.(ticket);
  }

  function openWhatsappTemplate221(){const value=settings().whatsappMessageTemplate||DEFAULT_MESSAGE;openModal('Mensagem padrão do WhatsApp',`<form data-form="whatsapp-template-v221"><div class="field full"><label>Mensagem padrão</label><textarea name="template" rows="10" required>${esc(value)}</textarea><small>Variáveis são substituídas em cada OSV. A mensagem só é alterada ao salvar.</small></div><div class="variable-toolbar-v221">${Object.entries(VARS).map(([v,l])=>`<button type="button" class="btn ghost compact" data-action="insert-whatsapp-variable" data-variable="${attr(v)}">${esc(l)}</button>`).join('')}</div><div class="form-actions"><button type="button" class="btn danger" data-action="restore-whatsapp-template">Restaurar padrão</button><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar mensagem</button></div></form>`);}

  function pdfTemplateCards221(){return activeTemplates().map(t=>{const key=t.designKey||'custom',colors={standard:['#f4f8fc','#2d72b8'],horizon:['#031a35','#137bc2'],cobalt:['#07152b','#0c619f'],connected:['#010b1d','#61c8ff'],crystal:['#d9f3ff','#3e9dd4'],technical:['#010817','#49c7ff'],custom:['#153d67','#7fb8e8']}[key]||['#153d67','#7fb8e8'];return `<article class="pdf-template-card-v221 ${t.id===settings().defaultPdfTemplateId?'default':''}" data-template-id="${attr(t.id)}"><div class="pdf-template-thumb-v221 template-${attr(key)}" style="--thumb-primary:${colors[0]};--thumb-accent:${colors[1]}"><div class="thumb-page-v221"><div class="thumb-header-v224"><span></span><i></i></div><div class="thumb-content-v224"><b></b><b></b><b></b><em></em></div><div class="thumb-footer-v224"><small>${t.pages.length} pág.</small><i></i></div></div></div><div class="pdf-template-copy-v224"><h3>${esc(t.name)} ${t.id===settings().defaultPdfTemplateId?'<span class="badge green">Padrão</span>':''}</h3><p>${esc(t.description||'Modelo personalizado')}</p><small>Alterado em ${formatDateTime(t.updatedAt)}</small></div><div class="pdf-template-actions-v221"><button class="btn primary compact" data-action="edit-pdf-template" data-id="${attr(t.id)}">Editar</button><button class="btn secondary compact" data-action="preview-pdf-template" data-id="${attr(t.id)}">Visualizar</button><button class="btn secondary compact" data-action="duplicate-pdf-template" data-id="${attr(t.id)}">Duplicar</button><button class="btn ghost compact" data-action="set-default-pdf-template" data-id="${attr(t.id)}" ${t.id===settings().defaultPdfTemplateId?'disabled':''}>Definir padrão</button><button class="btn ghost compact" data-action="rename-pdf-template" data-id="${attr(t.id)}">Renomear</button><button class="btn ghost compact" data-action="pdf-template-history" data-id="${attr(t.id)}" ${t.versions?.length?'':'disabled'}>Histórico</button><button class="btn ghost compact" data-action="export-pdf-template" data-id="${attr(t.id)}">Exportar</button><button class="btn danger compact" data-action="delete-pdf-template" data-id="${attr(t.id)}" ${activeTemplates().length===1?'disabled':''}>Excluir</button></div></article>`;}).join('');}

  function openPdfTemplates221(){openModal('Modelos de PDF',`<div class="pdf-template-manager-v221"><div class="card-header"><div><h2>Projetos de PDF</h2><p>Crie, edite, duplique e escolha o modelo usado nas OSVs.</p></div><div class="toolbar-left"><button class="btn primary" data-action="create-pdf-template" data-mode="default">+ Novo a partir do padrão</button><button class="btn secondary" data-action="create-pdf-template" data-mode="blank">Criar em branco</button><button class="btn secondary" data-action="import-pdf-template">Importar</button></div></div><div class="pdf-template-list-v221">${pdfTemplateCards221()}</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Fechar</button></div></div>`,true);}

  function createBlankPdfTemplate221(name,id){const t=defaultPdfTemplate(name,id);t.description='Modelo em branco';t.pages=[{id:'page-1',name:'Página 1',dynamic:false,components:[]}];t.isDefault=false;return t;}
  function sanitizePdfTemplate221(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.pages))throw new Error('Modelo de PDF inválido.');
    const allowed=new Set(Object.keys(PDF_COMPONENT_LIBRARY)),pageSize=['A4','Carta','Ofício'].includes(raw.page?.size)?raw.page.size:'A4',orientation=raw.page?.orientation==='landscape'?'landscape':'portrait';
    const safeColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'';
    const finiteOr=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
    const safeAsset=value=>{const url=String(value||'').trim();if(url.includes('..')||url.includes('\\')||url.startsWith('/'))return '';if(/^assets\/[a-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(url))return url;if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url)&&url.length<7_000_000)return url;return '';};
    const pages=raw.pages.slice(0,30).map((page,index)=>({id:uid('page'),name:String(page?.name||`Página ${index+1}`).slice(0,120),dynamic:!!page?.dynamic,components:(Array.isArray(page?.components)?page.components:[]).slice(0,300).filter(c=>allowed.has(String(c?.type||''))).map(c=>({
      id:uid('pdfc'),type:String(c.type),label:String(c.label||PDF_COMPONENT_LIBRARY[c.type]?.label||c.type).slice(0,120),x:clamp(Number(c.x)||0,0,356),y:clamp(Number(c.y)||0,0,356),width:clamp(Number(c.width)||20,5,356),height:clamp(Number(c.height)||10,3,356),text:String(c.text||'').slice(0,20000),fontSize:clamp(Number(c.fontSize)||10,6,48),lineHeight:clamp(Number(c.lineHeight)||1.28,.8,3),align:['left','center','right','justify'].includes(c.align)?c.align:'left',color:safeColor(c.color)||'#17304b',backgroundColor:safeColor(c.backgroundColor),startColor:safeColor(c.startColor)||'#031a35',endColor:safeColor(c.endColor)||'#137bc2',gradientDirection:['vertical','horizontal'].includes(c.gradientDirection)?c.gradientDirection:'vertical',strokeWidth:clamp(Number(c.strokeWidth)||1,.2,12),bold:!!c.bold,italic:!!c.italic,underline:!!c.underline,hideWhenEmpty:!!c.hideWhenEmpty,repeatOnEveryPage:!!c.repeatOnEveryPage,locked:!!c.locked,lockAspectRatio:c.lockAspectRatio!==false,zIndex:clamp(Number(c.zIndex)||1,-1000,1000),opacity:clamp(Number(c.opacity)||1,.1,1),columns:clamp(Number(c.columns)||2,1,3),perPage:clamp(Number(c.perPage)||4,1,9),assetLocalKey:String(c.assetLocalKey||'').replace(/[^a-z0-9_.:-]/gi,'').slice(0,180),assetName:String(c.assetName||'').slice(0,180),assetUrl:safeAsset(c.assetUrl),overflow:c.overflow==='next-page'?'next-page':'',fit:c.fit==='cover'?'cover':'contain'
    }))}));
    if(!pages.length)pages.push({id:uid('page'),name:'Página 1',dynamic:false,components:[]});
    return {id:uid('pdf-template'),name:String(raw.name||'Modelo importado').slice(0,120),description:String(raw.description||'').slice(0,500),isDefault:false,version:1,schemaVersion:3,engine:'visual',quality:['optimized','standard','high'].includes(raw.quality)?raw.quality:'standard',page:{size:pageSize,orientation,margins:{top:clamp(finiteOr(raw.page?.margins?.top,10),0,40),right:clamp(finiteOr(raw.page?.margins?.right,10),0,40),bottom:clamp(finiteOr(raw.page?.margins?.bottom,10),0,40),left:clamp(finiteOr(raw.page?.margins?.left,10),0,40)}},pages,assets:[],versions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function cloneTemplateWithoutVersions(t){const copy=cloneValue(t);copy.versions=[];(copy.pages||[]).forEach(page=>(page.components||[]).forEach(c=>{delete c.previewUrl;if(String(c.assetUrl||'').startsWith('blob:'))delete c.assetUrl;}));return copy;}
  function templateAssetKeys221(template){const keys=new Set(),visit=t=>{for(const page of t?.pages||[])for(const c of page?.components||[])if(c.assetLocalKey)keys.add(c.assetLocalKey);for(const version of t?.versions||[])if(version?.template)visit(version.template);};visit(template);return keys;}
  function allTemplateAssetKeys221(){const keys=new Set();for(const template of activeTemplates())for(const key of templateAssetKeys221(template))keys.add(key);return keys;}
  async function cleanupUnreferencedTemplateMedia221(candidateKeys){const referenced=allTemplateAssetKeys221();for(const key of candidateKeys||[])if(key&&!referenced.has(key))await MarcoStorage.deleteMedia(key).catch(error=>console.warn('Falha ao limpar mídia órfã do modelo:',error));}
  function blobToDataUrl221(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Não foi possível converter a imagem.'));reader.readAsDataURL(blob);});}
  function dataUrlToBlob221(value){const match=/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(String(value||''));if(!match)throw new Error('A imagem incorporada ao modelo é inválida.');const bytes=atob(match[2]),buffer=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)buffer[i]=bytes.charCodeAt(i);return new Blob([buffer],{type:match[1].toLowerCase()});}
  async function hydratePdfEditorAssets221(){if(!pdfEditor)return;for(const page of pdfEditor.template.pages||[])for(const c of page.components||[]){if(!c.assetLocalKey||c.previewUrl)continue;const rec=await MarcoStorage.getMedia(c.assetLocalKey).catch(()=>null);if(!rec?.blob)continue;const url=URL.createObjectURL(rec.blob);pdfEditor.objectUrls.add(url);c.previewUrl=url;c.assetName=c.assetName||rec.name||'';}}
  async function exportPdfTemplate221(template){const exported=cloneTemplateWithoutVersions(template);let embedded=0;for(const page of exported.pages||[])for(const c of page.components||[]){if(!c.assetLocalKey)continue;const rec=await MarcoStorage.getMedia(c.assetLocalKey);if(!rec?.blob)throw new Error(`A imagem ${c.assetName||c.label||'do modelo'} não foi encontrada no armazenamento local.`);if(rec.blob.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error(`A imagem ${rec.name||c.label||'do modelo'} ultrapassa 5 MB.`);embedded+=rec.blob.size;if(embedded>MAX_TEMPLATE_EMBEDDED_BYTES)throw new Error('As imagens deste modelo ultrapassam o limite de 20 MB para exportação em JSON.');c.assetUrl=await blobToDataUrl221(rec.blob);c.assetName=c.assetName||rec.name||'';delete c.assetLocalKey;}return {format:'marco-iris-pdf-template',version:2,template:exported};}
  function pushPdfHistory221(){if(!pdfEditor)return;pdfEditor.history.push(cloneValue(pdfEditor.template));if(pdfEditor.history.length>HISTORY_LIMIT)pdfEditor.history.shift();pdfEditor.future=[];pdfEditor.dirty=true;}
  function ensureInputHistory221(target,kind){if(!target||target.dataset.history221==='1')return;target.dataset.history221='1';if(kind==='layout')pushLayoutHistory();else pushPdfHistory221();}
  function currentPdfPage221(){return pdfEditor?.template.pages[pdfEditor.pageIndex];}
  function currentPdfComponent221(){return currentPdfPage221()?.components.find(x=>x.id===pdfEditor.selectedId)||null;}
  function pageMm221(){const p=pdfEditor.template.page,size=p.size==='Carta'?{w:216,h:279}:p.size==='Ofício'?{w:216,h:356}:{w:210,h:297};return p.orientation==='landscape'?{w:size.h,h:size.w}:size;}

  function defaultPdfEditorPreferences221(){return {zoomMode:'fit-page',zoom:1,leftPanelCollapsed:false,rightPanelCollapsed:false,showGrid:false,showGuides:true,viewMode:'page',handTool:false};}
  function pdfEditorPreferences221(){return {...defaultPdfEditorPreferences221(),...(settings().pdfEditorPreferences||{})};}
  function storePdfEditorPreferences221(){if(!pdfEditor)return;settings().pdfEditorPreferences={zoomMode:pdfEditor.zoomMode,zoom:pdfEditor.manualZoom,leftPanelCollapsed:pdfEditor.leftPanelCollapsed,rightPanelCollapsed:pdfEditor.rightPanelCollapsed,showGrid:pdfEditor.showGrid,showGuides:pdfEditor.showGuides,viewMode:pdfEditor.viewMode,handTool:pdfEditor.handTool};clearTimeout(pdfEditor.prefTimer);pdfEditor.prefTimer=setTimeout(()=>MarcoStorage.save(STATE).catch(()=>{}),180);}
  function actualPdfScale221(){return 96/25.4;}
  function computePdfScale221(mode=pdfEditor?.zoomMode){
    const viewport=document.querySelector('[data-pdf-viewport]'),mm=pageMm221();if(!viewport)return pdfEditor?.scale||actualPdfScale221();const widthPad=pdfEditor?.viewMode==='all'?52:44,heightPad=pdfEditor?.viewMode==='all'?64:96,availableWidth=Math.max(160,viewport.clientWidth-widthPad),availableHeight=Math.max(180,viewport.clientHeight-heightPad);if(mode==='fit-width')return clamp(availableWidth/mm.w,.35,8);if(mode==='actual')return actualPdfScale221();if(mode==='manual')return clamp(actualPdfScale221()*(pdfEditor.manualZoom||1),.25,8);return clamp(Math.min(availableWidth/mm.w,availableHeight/mm.h),.25,8);
  }
  function zoomPercent221(){return Math.round((pdfEditor.scale/actualPdfScale221())*100);}
  function applyPdfZoom221(mode,value=null,{render=true,store=true}={}){if(!pdfEditor)return;if(mode==='manual'&&Number.isFinite(Number(value)))pdfEditor.manualZoom=clamp(Number(value),.25,4);pdfEditor.zoomMode=mode;pdfEditor.scale=computePdfScale221(mode);if(store)storePdfEditorPreferences221();if(render)renderPdfEditor221();}
  function updatePdfModalClasses221(){const modal=document.querySelector('#modal-root .modal'),backdrop=document.querySelector('#modal-root .modal-backdrop'),root=document.querySelector('.pdf-editor-v221');if(!modal||!root)return;modal.classList.add('pdf-editor-modal-v224');backdrop?.classList.add('pdf-editor-backdrop-v224');modal.classList.toggle('pdf-editor-fullscreen-v224',!!pdfEditor.fullscreen);backdrop?.classList.toggle('pdf-editor-backdrop-fullscreen-v224',!!pdfEditor.fullscreen);root.classList.toggle('is-fullscreen',!!pdfEditor.fullscreen);root.classList.toggle('left-collapsed',!!pdfEditor.leftPanelCollapsed);root.classList.toggle('right-collapsed',!!pdfEditor.rightPanelCollapsed);root.classList.toggle('hand-active',!!pdfEditor.handTool);}
  async function openPdfEditor221(id){
    const source=activeTemplates().find(x=>x.id===id);if(!source)return;const prefs=pdfEditorPreferences221();
    const compactViewport=globalThis.matchMedia?.('(max-width: 900px)')?.matches===true;
    pdfEditor={template:cloneValue(source),sourceId:id,pageIndex:0,selectedId:'',history:[],future:[],dirty:false,scale:1,manualZoom:Number(prefs.zoom)||1,zoomMode:prefs.zoomMode||'fit-page',viewMode:prefs.viewMode==='all'?'all':'page',preview:false,interaction:null,snapEnabled:true,showGrid:!!prefs.showGrid,showGuides:prefs.showGuides!==false,leftPanelCollapsed:compactViewport?true:!!prefs.leftPanelCollapsed,rightPanelCollapsed:compactViewport?true:!!prefs.rightPanelCollapsed,handTool:!!prefs.handTool,fullscreen:false,objectUrls:new Set(),stagedMediaKeys:new Set(),backupCreated:false,panning:null,spacePressed:false,needsInitialFit:true};
    await hydratePdfEditorAssets221();
    openModal(`Editor de PDF — ${source.name}`,`<div class="pdf-editor-v221"><div class="pdf-editor-toolbar-v221">
      <button class="btn secondary compact" data-action="pdf-cancel">Voltar</button><strong class="pdf-editor-name-v224">${esc(source.name)}</strong>
      <button class="btn secondary compact" data-action="pdf-undo" disabled>Desfazer</button><button class="btn secondary compact" data-action="pdf-redo" disabled>Refazer</button>
      <div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="pdf-fit-page">Ajustar página</button><button class="btn ghost compact" data-action="pdf-fit-width">Ajustar à largura</button><button class="btn ghost compact" data-action="pdf-actual-size">Tamanho real</button></div>
      <div class="pdf-zoom-controls-v224"><button class="btn ghost compact" data-action="pdf-zoom-out" aria-label="Diminuir zoom">−</button><select data-pdf-zoom-select aria-label="Zoom"><option value="fit-page">Ajustar página</option><option value="fit-width">Ajustar à largura</option><option value="actual">Tamanho real</option>${[50,75,100,125,150,200].map(v=>`<option value="${v/100}">${v}%</option>`).join('')}</select><button class="btn ghost compact" data-action="pdf-zoom-in" aria-label="Aumentar zoom">+</button><button class="btn ghost compact" data-action="pdf-zoom-reset">Restaurar zoom</button></div>
      <button class="btn ghost compact" data-action="pdf-toggle-grid">Exibir grade</button><button class="btn ghost compact active" data-action="pdf-toggle-guides">Exibir guias</button><button class="btn ghost compact" data-action="pdf-toggle-snap">Encaixe</button><button class="btn ghost compact" data-action="pdf-hand-tool">Mão</button><button class="btn ghost compact" data-action="pdf-center-page">Centralizar</button>
      <button class="btn ghost compact" data-action="pdf-toggle-left-panel">Ocultar painel esquerdo</button><button class="btn ghost compact" data-action="pdf-toggle-right-panel">Ocultar painel direito</button><button class="btn ghost compact" data-action="pdf-show-panels">Mostrar painéis</button>
      <label class="pdf-preview-source-v221"><span>Dados da prévia</span><select data-pdf-preview-order><option value="">Dados de exemplo</option>${(data().serviceOrders||[]).slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,30).map(o=>`<option value="${attr(o.id)}">${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></label>
      <button class="btn ghost compact" data-action="pdf-preview">Pré-visualização limpa</button><button class="btn ghost compact" data-action="pdf-toggle-fullscreen">Tela cheia</button><button class="btn primary compact" data-action="pdf-save">Salvar</button>
    </div><div class="pdf-editor-shell-v221"><aside class="pdf-components-panel-v221"><div class="pdf-panel-heading-v224"><h3>Páginas</h3><button class="icon-btn" data-action="pdf-toggle-left-panel" aria-label="Ocultar painel esquerdo">×</button></div><div class="pdf-page-mode-v224"><button data-action="pdf-view-mode" data-mode="page">Editar página</button><button data-action="pdf-view-mode" data-mode="all">Visualizar todas</button></div><div class="pdf-page-list-v224" data-pdf-page-list></div><div class="pdf-page-actions-v224"><button data-action="pdf-add-page">+ Adicionar página</button><button data-action="pdf-duplicate-page">Duplicar página</button><button data-action="pdf-move-page" data-direction="-1">Mover antes</button><button data-action="pdf-move-page" data-direction="1">Mover depois</button><button data-action="pdf-delete-page">Excluir página</button></div><hr><h3>Componentes</h3><div class="pdf-component-library-v224">${Object.entries(PDF_COMPONENT_LIBRARY).map(([type,c])=>`<button data-action="pdf-add-component" data-type="${type}">${esc(c.label)}</button>`).join('')}</div></aside><main class="pdf-page-work-v221"><div class="pdf-work-header-v224"><div class="pdf-page-tabs-v221" data-pdf-page-tabs></div><div class="pdf-page-status-v224"><button class="btn ghost compact" data-action="pdf-prev-page">←</button><span data-pdf-page-status>Página 1 de 1</span><button class="btn ghost compact" data-action="pdf-next-page">→</button><strong data-pdf-zoom-label>100%</strong></div></div><div class="pdf-page-scroll-v221" data-pdf-viewport tabindex="0"><div class="pdf-pages-stage-v224" data-pdf-pages-host></div></div></main><aside class="pdf-properties-v221" data-pdf-properties><div class="empty compact-empty">Selecione um elemento.</div></aside></div><footer class="editor-footer-v221"><button class="btn secondary" data-action="pdf-cancel">Cancelar</button><span class="muted" data-pdf-editor-hint>Barra de espaço + arrastar move a área de trabalho.</span><div><button class="btn secondary" data-action="pdf-preview">Visualizar PDF</button><button class="btn secondary" data-action="pdf-save-as">Salvar como novo modelo</button><button class="btn primary" data-action="pdf-save">Salvar alterações</button></div></footer></div>`,true);
    updatePdfModalClasses221();renderPdfEditor221();
    requestAnimationFrame(()=>{if(!pdfEditor)return;pdfEditor.scale=computePdfScale221(pdfEditor.zoomMode);pdfEditor.needsInitialFit=false;renderPdfEditor221();});
    pdfEditor.resizeObserver=new ResizeObserver(()=>{if(!pdfEditor||!['fit-page','fit-width'].includes(pdfEditor.zoomMode))return;const next=computePdfScale221(pdfEditor.zoomMode);if(Math.abs(next-pdfEditor.scale)>.02){pdfEditor.scale=next;renderPdfEditor221();}});const viewport=document.querySelector('[data-pdf-viewport]');if(viewport)pdfEditor.resizeObserver.observe(viewport);
  }
  function renderPdfPageCanvas221(page,pageIndex,host){
    const mm=pageMm221(),scale=pdfEditor.scale,wrap=document.createElement('section');wrap.className=`pdf-page-wrap-v224 ${pageIndex===pdfEditor.pageIndex?'current':''}`;wrap.dataset.pdfPageIndex=String(pageIndex);wrap.innerHTML=`<div class="pdf-page-caption-v224"><strong>Página ${pageIndex+1}</strong><span>${esc(page.name||'Sem nome')}</span></div>`;const canvas=document.createElement('div');canvas.className=`pdf-page-canvas-v221 ${pdfEditor.showGrid?'show-grid':''}`;canvas.dataset.pdfCanvas='1';canvas.dataset.pdfPageIndex=String(pageIndex);canvas.style.width=`${mm.w*scale}px`;canvas.style.height=`${mm.h*scale}px`;canvas.style.setProperty('--pdf-grid',`${5*scale}px`);const margins=pdfEditor.template.page.margins||{top:10,right:10,bottom:10,left:10};if(pdfEditor.showGuides)canvas.insertAdjacentHTML('beforeend',`<div class="pdf-safe-area-v224" style="left:${margins.left*scale}px;top:${margins.top*scale}px;right:${margins.right*scale}px;bottom:${margins.bottom*scale}px" title="Área segura de impressão"></div>`);
    [...page.components].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0)).forEach(c=>{const el=document.createElement('article');const outside=!c.locked&&(c.x<margins.left||c.y<margins.top||c.x+c.width>mm.w-margins.right||c.y+c.height>mm.h-margins.bottom);el.className=`pdf-component-v221 type-${c.type} ${c.id===pdfEditor.selectedId&&pageIndex===pdfEditor.pageIndex?'selected':''} ${c.locked?'locked':''} ${outside?'outside-safe':''}`;el.dataset.pdfComponentId=c.id;el.tabIndex=0;el.setAttribute('aria-label',`${c.label}, posição ${c.x} por ${c.y} milímetros`);el.innerHTML=`<div class="pdf-component-content-v221">${pdfComponentPreviewHtml221(c)}</div>${c.locked||pdfEditor.viewMode==='all'?'':pdfResizeHandlesHtml221(c)}`;canvas.appendChild(el);updatePdfComponentVisual221(c,canvas);});
    if(pageIndex===pdfEditor.pageIndex)canvas.insertAdjacentHTML('beforeend','<div class="pdf-guide-v221 vertical" data-pdf-guide-x hidden></div><div class="pdf-guide-v221 horizontal" data-pdf-guide-y hidden></div>');wrap.appendChild(canvas);host.appendChild(wrap);
  }
  function renderPdfEditor221(){
    if(!pdfEditor)return;const host=document.querySelector('[data-pdf-pages-host]'),tabs=document.querySelector('[data-pdf-page-tabs]'),list=document.querySelector('[data-pdf-page-list]');if(!host)return;updatePdfModalClasses221();host.innerHTML='';
    const pages=pdfEditor.viewMode==='all'?pdfEditor.template.pages:[currentPdfPage221()];pages.forEach(page=>renderPdfPageCanvas221(page,pdfEditor.template.pages.indexOf(page),host));
    const pageButtons=pdfEditor.template.pages.map((p,i)=>`<button class="${i===pdfEditor.pageIndex?'active':''}" data-action="pdf-page-select" data-index="${i}">${i+1}. ${esc(p.name||`Página ${i+1}`)}</button>`).join('');if(tabs)tabs.innerHTML=pageButtons;if(list)list.innerHTML=pdfEditor.template.pages.map((p,i)=>`<button class="pdf-page-thumb-v224 ${i===pdfEditor.pageIndex?'active':''}" data-action="pdf-page-select" data-index="${i}"><span class="pdf-mini-page-v224 design-${attr(pdfEditor.template.designKey||'custom')}"><i></i><b></b><em></em></span><span><strong>Página ${i+1}</strong><small>${esc(p.name||'Sem nome')}</small></span></button>`).join('');
    renderPdfProperties221();const root=document.querySelector('.pdf-editor-v221');root?.querySelector('[data-action="pdf-undo"]')?.toggleAttribute('disabled',!pdfEditor.history.length);root?.querySelector('[data-action="pdf-redo"]')?.toggleAttribute('disabled',!pdfEditor.future.length);root?.querySelector('[data-action="pdf-toggle-snap"]')?.classList.toggle('active',pdfEditor.snapEnabled!==false);root?.querySelector('[data-action="pdf-toggle-grid"]')?.classList.toggle('active',pdfEditor.showGrid);root?.querySelector('[data-action="pdf-toggle-guides"]')?.classList.toggle('active',pdfEditor.showGuides);root?.querySelector('[data-action="pdf-hand-tool"]')?.classList.toggle('active',pdfEditor.handTool);root?.querySelectorAll('[data-action="pdf-view-mode"]').forEach(b=>b.classList.toggle('active',b.dataset.mode===pdfEditor.viewMode));const status=root?.querySelector('[data-pdf-page-status]');if(status)status.textContent=`Página ${pdfEditor.pageIndex+1} de ${pdfEditor.template.pages.length}`;const zoom=root?.querySelector('[data-pdf-zoom-label]');if(zoom)zoom.textContent=`${zoomPercent221()}%`;const select=root?.querySelector('[data-pdf-zoom-select]');if(select){const value=pdfEditor.zoomMode==='manual'?String([.5,.75,1,1.25,1.5,2].find(v=>Math.abs(v-pdfEditor.manualZoom)<.01)||pdfEditor.manualZoom):pdfEditor.zoomMode;select.value=String(value);}const full=root?.querySelector('[data-action="pdf-toggle-fullscreen"]');if(full)full.textContent=pdfEditor.fullscreen?'Sair da tela cheia':'Tela cheia';
  }
  function updatePdfComponentVisual221(c,scope=document){const el=scope.querySelector?.(`[data-pdf-component-id="${CSS.escape(c.id)}"]`)||document.querySelector(`[data-pdf-component-id="${CSS.escape(c.id)}"]`),scale=pdfEditor?.scale||actualPdfScale221();if(!el)return;el.style.left=`${c.x*scale}px`;el.style.top=`${c.y*scale}px`;el.style.width=`${c.width*scale}px`;el.style.height=`${c.height*scale}px`;el.style.zIndex=String(c.zIndex||1);el.style.opacity=String(c.opacity??1);el.classList.toggle('selected',c.id===pdfEditor.selectedId);el.classList.toggle('locked',!!c.locked);const content=el.querySelector('.pdf-component-content-v221');if(content)content.innerHTML=pdfComponentPreviewHtml221(c);}
  function showPdfGuides221(x=null,y=null){if(!pdfEditor.showGuides)return;const gx=document.querySelector('[data-pdf-guide-x]'),gy=document.querySelector('[data-pdf-guide-y]'),scale=pdfEditor?.scale||actualPdfScale221();if(gx){gx.hidden=x===null;gx.style.left=`${(x||0)*scale}px`;}if(gy){gy.hidden=y===null;gy.style.top=`${(y||0)*scale}px`;}}

  function snapPdfPosition221(component,next,mode='move'){
    if(pdfEditor?.snapEnabled===false)return next;const mm=pageMm221(),threshold=2.5,out={...next},step=.5;out.x=Math.round(out.x/step)*step;out.y=Math.round(out.y/step)*step;out.width=Math.round(out.width/step)*step;out.height=Math.round(out.height/step)*step;
    const xTargets=[0,mm.w/2,mm.w],yTargets=[0,mm.h/2,mm.h];currentPdfPage221().components.filter(c=>c.id!==component.id).forEach(c=>{xTargets.push(c.x,c.x+c.width,c.x+c.width/2);yTargets.push(c.y,c.y+c.height,c.y+c.height/2);});
    const edgesX=[out.x,out.x+out.width,out.x+out.width/2],edgesY=[out.y,out.y+out.height,out.y+out.height/2];let guideX=null,guideY=null;
    outerX:for(const target of xTargets)for(let i=0;i<edgesX.length;i++)if(Math.abs(edgesX[i]-target)<=threshold){const delta=target-edgesX[i];if(mode==='resize'&&i===1)out.width+=delta;else out.x+=delta;guideX=target;break outerX;}
    outerY:for(const target of yTargets)for(let i=0;i<edgesY.length;i++)if(Math.abs(edgesY[i]-target)<=threshold){const delta=target-edgesY[i];if(mode==='resize'&&i===1)out.height+=delta;else out.y+=delta;guideY=target;break outerY;}
    showPdfGuides221(guideX,guideY);return out;
  }
  function closePdfEditorAssets221(){pdfEditor?.resizeObserver?.disconnect?.();clearTimeout(pdfEditor?.prefTimer);for(const url of pdfEditor?.objectUrls||[])try{URL.revokeObjectURL(url);}catch(_){}if(pdfEditor)pdfEditor.objectUrls?.clear?.();document.querySelector('#modal-root .modal')?.classList.remove('pdf-editor-modal-v224','pdf-editor-fullscreen-v224');document.querySelector('#modal-root .modal-backdrop')?.classList.remove('pdf-editor-backdrop-v224','pdf-editor-backdrop-fullscreen-v224');}
  async function cleanupStagedPdfMedia221(keepReferenced=false){if(!pdfEditor?.stagedMediaKeys?.size)return;const referenced=new Set();if(keepReferenced){for(const page of pdfEditor.template.pages||[])for(const c of page.components||[])if(c.assetLocalKey)referenced.add(c.assetLocalKey);}for(const key of [...pdfEditor.stagedMediaKeys]){if(keepReferenced&&referenced.has(key))continue;await MarcoStorage.deleteMedia(key).catch(error=>console.warn('Falha ao limpar imagem temporária do modelo:',error));}pdfEditor.stagedMediaKeys.clear();}

  function pdfComponentPreviewHtml221(c){
    if(c.type==='line')return `<span class="preview-line-v221" style="border-color:${attr(c.color||'#2d72b8')}"></span>`;
    if(c.type==='rect')return `<span class="preview-rect-v221" style="background:${attr(c.backgroundColor||'transparent')};border-color:${attr(c.color||'#2d72b8')}"></span>`;
    if(c.type==='gradient'){const direction=c.gradientDirection==='horizontal'?'90deg':'180deg';return `<span class="preview-gradient-v221" style="background:linear-gradient(${direction},${attr(c.startColor||'#031a35')},${attr(c.endColor||'#137bc2')})"></span>`;}
    if(c.type==='pix-qr'){const config=defaultPixConfiguration221(),code=pixCodeFor221(config);if(code&&window.MarcoQr){try{return `<img src="${attr(MarcoQr.toDataURL(code,{size:320,margin:4,level:'Q'}))}" alt="QR Code Pix">`;}catch(_){}}return '<div class="preview-qr-v224"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';}
    if(c.type==='logo'||c.type==='image'){const src=c.previewUrl||c.assetUrl;return src?`<img src="${attr(src)}" alt="${attr(c.label||'Imagem')}">`:`<div class="image-placeholder-v221">Imagem</div>`;}
    if(c.type.startsWith('table-'))return `<strong>${esc(c.label)}</strong><div class="preview-table-v221"><i></i><i></i><i></i></div>`;
    if(c.type==='photos-grid')return `<strong>Fotos</strong><div class="preview-photos-v221"><i></i><i></i><i></i><i></i></div>`;
    return `<span style="font-size:${Math.max(8,(c.fontSize||10)*.9)}px;font-weight:${c.bold?'800':'400'};text-align:${c.align||'left'};color:${c.color||'#17304b'}">${esc(c.text||c.label)}</span>`;
  }
  function renderPdfProperties221(){
    const panel=document.querySelector('[data-pdf-properties]'),c=currentPdfComponent221();if(!panel)return;
    if(!c){const m=pdfEditor.template.page.margins||{top:10,right:10,bottom:10,left:10};panel.innerHTML=`<h3>Documento</h3><label class="field"><span>Nome do modelo</span><input data-pdf-template-prop="name" value="${attr(pdfEditor.template.name)}"></label><div class="property-grid-v221"><label>Tamanho<select data-pdf-template-prop="size"><option ${pdfEditor.template.page.size==='A4'?'selected':''}>A4</option><option ${pdfEditor.template.page.size==='Carta'?'selected':''}>Carta</option><option ${pdfEditor.template.page.size==='Ofício'?'selected':''}>Ofício</option></select></label><label>Orientação<select data-pdf-template-prop="orientation"><option value="portrait" ${pdfEditor.template.page.orientation==='portrait'?'selected':''}>Retrato</option><option value="landscape" ${pdfEditor.template.page.orientation==='landscape'?'selected':''}>Paisagem</option></select></label><label>Qualidade<select data-pdf-template-prop="quality"><option value="optimized" ${pdfEditor.template.quality==='optimized'?'selected':''}>Otimizado</option><option value="standard" ${!pdfEditor.template.quality||pdfEditor.template.quality==='standard'?'selected':''}>Padrão</option><option value="high" ${pdfEditor.template.quality==='high'?'selected':''}>Alta qualidade</option></select></label></div><h4>Margens (mm)</h4><div class="property-grid-v221"><label>Superior<input type="number" min="0" max="40" data-pdf-margin="top" value="${m.top||0}"></label><label>Direita<input type="number" min="0" max="40" data-pdf-margin="right" value="${m.right||0}"></label><label>Inferior<input type="number" min="0" max="40" data-pdf-margin="bottom" value="${m.bottom||0}"></label><label>Esquerda<input type="number" min="0" max="40" data-pdf-margin="left" value="${m.left||0}"></label></div>`;return;}
    const textType=!['line','rect','gradient','image','logo','table-items','table-products','table-services','table-payments','photos-grid','pix-qr'].includes(c.type);
    panel.innerHTML=`<h3>${esc(c.label)}</h3><p class="muted">${esc(c.type)}</p>${textType?`<label class="field"><span>Conteúdo</span><textarea data-pdf-prop="text" rows="4">${esc(c.text||'')}</textarea></label><div class="insert-variable-v221"><select data-pdf-variable-select><option value="">Inserir campo…</option>${PDF_VARS.map(([token,label])=>`<option value="${attr(token)}">${esc(label)}</option>`).join('')}</select><button class="btn secondary compact" data-action="pdf-insert-variable">Inserir</button></div>`:''}<div class="property-grid-v221"><label>X<input type="number" step="0.5" data-pdf-prop="x" value="${c.x}"></label><label>Y<input type="number" step="0.5" data-pdf-prop="y" value="${c.y}"></label><label>Largura<input type="number" step="0.5" min="5" data-pdf-prop="width" value="${c.width}"></label><label>Altura<input type="number" step="0.5" min="3" data-pdf-prop="height" value="${c.height}"></label></div>${c.fontSize?`<div class="property-grid-v221"><label>Fonte<input type="number" min="6" max="48" data-pdf-prop="fontSize" value="${c.fontSize}"></label><label>Entrelinhas<input type="number" min="0.8" max="3" step="0.1" data-pdf-prop="lineHeight" value="${c.lineHeight||1.28}"></label><label>Alinhamento<select data-pdf-prop="align"><option value="left" ${c.align==='left'?'selected':''}>Esquerda</option><option value="center" ${c.align==='center'?'selected':''}>Centro</option><option value="right" ${c.align==='right'?'selected':''}>Direita</option><option value="justify" ${c.align==='justify'?'selected':''}>Justificado</option></select></label><label>Cor<input type="color" data-pdf-prop="color" value="${/^#[0-9a-f]{6}$/i.test(c.color||'')?c.color:'#17304b'}"></label></div>`:''}<div class="property-grid-v221"><label>Opacidade<input type="number" min="0.1" max="1" step="0.05" data-pdf-prop="opacity" value="${c.opacity??1}"></label>${['rect','text','title','subtitle','field'].includes(c.type)?`<label>Fundo<input type="color" data-pdf-prop="backgroundColor" value="${/^#[0-9a-f]{6}$/i.test(c.backgroundColor||'')?c.backgroundColor:'#ffffff'}"></label>`:''}</div>${c.type==='gradient'?`<div class="property-grid-v221"><label>Cor inicial<input type="color" data-pdf-prop="startColor" value="${/^#[0-9a-f]{6}$/i.test(c.startColor||'')?c.startColor:'#031a35'}"></label><label>Cor final<input type="color" data-pdf-prop="endColor" value="${/^#[0-9a-f]{6}$/i.test(c.endColor||'')?c.endColor:'#137bc2'}"></label><label>Direção<select data-pdf-prop="gradientDirection"><option value="vertical" ${c.gradientDirection!=='horizontal'?'selected':''}>Vertical</option><option value="horizontal" ${c.gradientDirection==='horizontal'?'selected':''}>Horizontal</option></select></label></div>`:''}${c.type==='photos-grid'?`<div class="property-grid-v221"><label>Colunas<input type="number" min="1" max="3" data-pdf-prop="columns" value="${c.columns||2}"></label><label>Fotos por página<input type="number" min="1" max="9" data-pdf-prop="perPage" value="${c.perPage||4}"></label></div>`:''}${c.fontSize?`<label class="list-row compact"><div class="list-row-main"><strong>Negrito</strong></div><input type="checkbox" data-pdf-prop-check="bold" ${c.bold?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Itálico</strong></div><input type="checkbox" data-pdf-prop-check="italic" ${c.italic?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Sublinhado</strong></div><input type="checkbox" data-pdf-prop-check="underline" ${c.underline?'checked':''}></label>`:''}<label class="list-row compact"><div class="list-row-main"><strong>Ocultar quando vazio</strong></div><input type="checkbox" data-pdf-prop-check="hideWhenEmpty" ${c.hideWhenEmpty?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Repetir em continuações</strong></div><input type="checkbox" data-pdf-prop-check="repeatOnEveryPage" ${c.repeatOnEveryPage?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Bloquear</strong></div><input type="checkbox" data-pdf-prop-check="locked" ${c.locked?'checked':''}></label><div class="pdf-layer-actions-v221"><button class="btn secondary compact" data-action="pdf-bring-front">Trazer para frente</button><button class="btn secondary compact" data-action="pdf-send-back">Enviar para trás</button><button class="btn secondary compact" data-action="pdf-duplicate-component">Duplicar</button><button class="btn danger compact" data-action="pdf-delete-component">Excluir</button></div>${c.type==='image'||c.type==='logo'?`<div class="property-grid-v221"><label>Ajuste<select data-pdf-prop="fit"><option value="contain" ${c.fit!=='cover'?'selected':''}>Conter sem deformar</option><option value="cover" ${c.fit==='cover'?'selected':''}>Preencher e recortar</option></select></label></div><label class="list-row compact"><div class="list-row-main"><strong>Manter proporção</strong></div><input type="checkbox" data-pdf-prop-check="lockAspectRatio" ${c.lockAspectRatio!==false?'checked':''}></label><button class="btn primary full" data-action="pdf-choose-image">Escolher imagem</button>`:''}`;
  }

  function validatePdfTemplate221(template){
    const issues=[],allowed=new Set(Object.keys(PDF_COMPONENT_LIBRARY)),knownVars=new Set(PDF_VARS.map(([token])=>token)),pageIds=new Set(),componentIds=new Set();
    if(!template||typeof template!=='object')return ['Modelo de PDF inválido.'];
    if(!String(template.name||'').trim())issues.push('Informe o nome do modelo.');
    if(!Array.isArray(template.pages)||!template.pages.length)issues.push('O modelo precisa ter pelo menos uma página.');
    const pageSize=template.page?.size==='Carta'?{w:216,h:279}:template.page?.size==='Ofício'?{w:216,h:356}:{w:210,h:297},mm=template.page?.orientation==='landscape'?{w:pageSize.h,h:pageSize.w}:pageSize;
    for(const [pageIndex,page] of (template.pages||[]).entries()){
      if(!page?.id||pageIds.has(page.id))issues.push(`A página ${pageIndex+1} possui identificador ausente ou duplicado.`);else pageIds.add(page.id);
      for(const component of page?.components||[]){
        if(!component?.id||componentIds.has(component.id))issues.push(`Existe componente com identificador ausente ou duplicado na página ${pageIndex+1}.`);else componentIds.add(component.id);
        if(!allowed.has(component?.type))issues.push(`Componente não autorizado na página ${pageIndex+1}.`);
        const x=Number(component?.x),y=Number(component?.y),width=Number(component?.width),height=Number(component?.height);
        const minHeight=component?.type==='line'?.2:3;if(![x,y,width,height].every(Number.isFinite)||width<5||height<minHeight)issues.push(`${component?.label||'Componente'} possui medidas inválidas.`);
        else if(x<0||y<0||x+width>mm.w+.1||y+height>mm.h+.1)issues.push(`${component?.label||'Componente'} está fora dos limites da página ${pageIndex+1}.`);
        const tokens=String(component?.text||'').match(/\{\{[^{}]+\}\}/g)||[];
        for(const token of tokens)if(!knownVars.has(token))issues.push(`A variável ${token} não existe na lista controlada.`);
        if(['image','logo'].includes(component?.type)&&!component.assetLocalKey&&!component.assetUrl&&!component.previewUrl)issues.push(`${component?.label||'Imagem'} está sem arquivo.`);
        if(component?.type==='gradient'&&(!/^#[0-9a-f]{6}$/i.test(component.startColor||'')||!/^#[0-9a-f]{6}$/i.test(component.endColor||'')))issues.push(`${component?.label||'Degradê'} possui cores inválidas.`);
        if(component?.type==='gradient'&&!['vertical','horizontal'].includes(component.gradientDirection))issues.push(`${component?.label||'Degradê'} possui direção inválida.`);
      }
    }
    return [...new Set(issues)];
  }
  async function savePdfTemplate221(){const source=activeTemplates().find(x=>x.id===pdfEditor.sourceId);if(!source)return;const issues=validatePdfTemplate221(pdfEditor.template);if(issues.length){toast(issues[0],'error');return;}const mm=pageMm221(),m=pdfEditor.template.page?.margins||{top:10,right:10,bottom:10,left:10},unsafe=(pdfEditor.template.pages||[]).flatMap((page,pageIndex)=>(page.components||[]).filter(c=>!c.locked&&(c.x<m.left||c.y<m.top||c.x+c.width>mm.w-m.right||c.y+c.height>mm.h-m.bottom)).map(c=>`${pageIndex+1}: ${c.label||c.type}`));if(unsafe.length&&!await confirmAction(`Há ${unsafe.length} componente(s) fora da área segura de impressão e eles poderão ser cortados. Salvar mesmo assim?`))return;if(pdfEditor.dirty&&!pdfEditor.backupCreated){await MarcoStorage.createBackup(STATE,'antes-salvar-modelo-pdf-v2.2.4');pdfEditor.backupCreated=true;}const previousAssetKeys=templateAssetKeys221(source),snapshot=cloneTemplateWithoutVersions(source);source.versions=Array.isArray(source.versions)?source.versions:[];source.versions.unshift({id:uid('pdfver'),version:source.version||1,createdAt:new Date().toISOString(),template:snapshot});source.versions=source.versions.slice(0,10);const next=cloneTemplateWithoutVersions(pdfEditor.template);next.version=(Number(source.version)||1)+1;next.updatedAt=new Date().toISOString();next.versions=source.versions;Object.keys(source).forEach(k=>delete source[k]);Object.assign(source,next);await persist('Modelo de PDF salvo',`${source.name} · versão ${source.version}`);await cleanupStagedPdfMedia221(true);await cleanupUnreferencedTemplateMedia221(previousAssetKeys);closePdfEditorAssets221();pdfEditor=null;closeModal();renderView();toast('Modelo de PDF salvo.');}

  function pdfDemoOrder221(){const selected=document.querySelector('[data-pdf-preview-order]')?.value,found=selected?findOrder(selected):null,order=found||{id:'OSV-000001',openedAt:today(),status:'Em andamento',clientId:'',clientName:'João da Silva',equipmentType:'Notebook',brandModel:'Modelo demonstrativo',serialNumber:'ABC123',reportedIssue:'Equipamento não liga e apresenta falha intermitente.',technicalReport:'Diagnóstico técnico de demonstração com conteúdo suficiente para validar a quebra de linhas.',discount:25,total:475,photos:[]};return cloneValue(order);}
  async function generatePdfPreview221(download=false){const order=pdfDemoOrder221(),client=findClient(order.clientId)||{name:order.clientName||'João da Silva',phone:'+55 (17) 99778-2226',address:'Rua de Exemplo, 100'};const result=await MarcoPdf.generate(order,{template:pdfEditor.template,client,company:company(),items:orderItems(order.id)||[],payments:orderPayments(order.id)||[],itemName:itemDescription,getPhotoBlob:getMediaBlob});if(download){MarcoStorage.downloadBlob(result.blob,`TESTE_${pdfEditor.template.name.replace(/[^\wÀ-ÿ-]+/g,'-')}_${today()}.pdf`);toast('PDF de teste gerado sem alterar a OSV.');return;}const url=URL.createObjectURL(result.blob),overlay=document.createElement('div');overlay.className='pdf-preview-overlay-v221';overlay.dataset.pdfPreviewOverlay='1';overlay.innerHTML=`<section class="pdf-preview-dialog-v221" role="dialog" aria-modal="true" aria-label="Pré-visualização do PDF"><header><h2>Pré-visualização do PDF</h2><button class="modal-close" data-action="pdf-close-preview" aria-label="Fechar pré-visualização">×</button></header><iframe title="Pré-visualização do PDF" src="${attr(url)}"></iframe><footer><button class="btn secondary" data-action="pdf-close-preview">Voltar para edição</button></footer></section>`;overlay.dataset.objectUrl=url;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add('is-open'));}

  function captureWhatsappTemplate221(btn){const root=btn.closest('.whatsapp-review-modal'),textarea=root?.querySelector('[data-whatsapp-message]');if(!textarea||!textarea.value.trim())return false;const code=(textarea.value.match(/OSV-\d{6}/i)||[])[0],orderId=root?.dataset.orderId||code||'',order=orderId?findOrder(String(orderId).toUpperCase()):null;if(!order)return false;const template=templatizeMessage(textarea.value,order);if(!template.trim())return false;settings().whatsappMessageTemplate=template;settings().whatsappMessageUpdatedAt=new Date().toISOString();return true;}
  function watchWhatsappReview221(){whatsappObserver?.disconnect?.();const root=document.getElementById('confirm-root');if(!root)return;whatsappObserver=new MutationObserver(()=>{const modal=root.querySelector('.whatsapp-review-modal'),textarea=modal?.querySelector('[data-whatsapp-message]');if(!textarea||textarea.dataset.template221==='1')return;const current=modal?.dataset.orderId||(textarea.value.match(/OSV-\d{6}/i)||[])[0],order=current?findOrder(String(current).toUpperCase()):null;if(!order)return;textarea.dataset.template221='1';textarea.value=renderVariableTemplate(settings().whatsappMessageTemplate||DEFAULT_MESSAGE,order);});whatsappObserver.observe(root,{childList:true,subtree:true});}

  function pixManagerCards221(){
    const list=settings().pixConfigurations||[];
    return list.map(x=>`<article class="pix-config-card-v224 ${x.id===settings().defaultPixConfigurationId?'default':''}"><div><h3>${esc(x.name||'Configuração Pix')} ${x.id===settings().defaultPixConfigurationId?'<span class="badge green">Padrão</span>':''}</h3><p><strong>${esc(x.beneficiary||'Favorecido não informado')}</strong><br>${esc(x.keyType||'Chave')}: ${esc(x.pixKey||'—')}<br>${esc(x.bankName||'Instituição não informada')}</p><small>${x.active===false?'Inativa':'Ativa'} · alterada em ${formatDateTime(x.updatedAt||x.createdAt)}</small></div><div class="pix-config-actions-v224"><button class="btn primary compact" data-action="edit-pix-config" data-id="${attr(x.id)}">Editar</button><button class="btn secondary compact" data-action="test-pix-config" data-id="${attr(x.id)}">Testar QR Code</button><button class="btn ghost compact" data-action="copy-pix-code" data-id="${attr(x.id)}">Copiar</button><button class="btn ghost compact" data-action="set-default-pix" data-id="${attr(x.id)}" ${x.id===settings().defaultPixConfigurationId?'disabled':''}>Definir padrão</button><button class="btn danger compact" data-action="delete-pix-config" data-id="${attr(x.id)}">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhuma configuração Pix cadastrada.</div>';
  }
  function mountPixOverlay221(html,title='Dados de pagamento e Pix'){
    document.querySelector('[data-pix-overlay]')?.remove();const overlay=document.createElement('div');overlay.className='pix-overlay-v224';overlay.dataset.pixOverlay='1';overlay.innerHTML=`<section class="pix-dialog-v224" role="dialog" aria-modal="true" aria-label="${attr(title)}"><header><div><h2>${esc(title)}</h2><p>Configurações comerciais salvas no perfil atual e usadas localmente.</p></div><button class="modal-close" data-action="pix-overlay-close" aria-label="Fechar">×</button></header><div class="pix-dialog-body-v224">${html}</div></section>`;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add('is-open'));return overlay;
  }
  function openPixManager221(){
    mountPixOverlay221(`<div class="pix-manager-v224"><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-pix-config">+ Nova configuração Pix</button></div></div><div class="pix-config-list-v224">${pixManagerCards221()}</div><div class="form-actions"><button class="btn secondary" data-action="pix-overlay-close">Fechar</button></div></div>`);
  }
  function openPixConfigForm221(id=''){
    const x=(settings().pixConfigurations||[]).find(v=>v.id===id)||{id:'',name:'Pix principal',beneficiary:'',beneficiaryDocument:'',bankName:'',keyType:'CPF',pixKey:'',city:'',description:'Pagamento de ordem de serviço',copyPasteCode:'',active:true};
    mountPixOverlay221(`<form data-form="pix-config-v224" data-id="${attr(id)}"><div class="form-grid two"><div class="field"><label>Nome da configuração *</label><input name="name" required maxlength="80" value="${attr(x.name||'')}"></div><div class="field"><label>Nome do favorecido *</label><input name="beneficiary" required maxlength="120" value="${attr(x.beneficiary||'')}"></div><div class="field"><label>Documento do favorecido</label><input name="beneficiaryDocument" maxlength="30" value="${attr(x.beneficiaryDocument||'')}"></div><div class="field"><label>Banco ou instituição</label><input name="bankName" maxlength="100" value="${attr(x.bankName||'')}"></div><div class="field"><label>Tipo de chave Pix</label><select name="keyType">${['CPF','CNPJ','Telefone','E-mail','Chave aleatória','Pix Copia e Cola'].map(v=>`<option ${v===x.keyType?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Chave Pix *</label><input name="pixKey" required maxlength="180" value="${attr(x.pixKey||'')}"></div><div class="field"><label>Cidade</label><input name="city" maxlength="80" value="${attr(x.city||'')}"></div><div class="field"><label>Descrição padrão</label><input name="description" maxlength="140" value="${attr(x.description||'')}"></div><div class="field full"><label>Código Pix Copia e Cola *</label><textarea name="copyPasteCode" rows="5" required maxlength="1200">${esc(x.copyPasteCode||'')}</textarea><small>O QR Code é gerado no próprio aparelho, sem API externa.</small></div><label class="check-field full"><input type="checkbox" name="active" ${x.active!==false?'checked':''}><span>Configuração ativa</span></label></div><div class="form-actions"><button type="button" class="btn secondary" data-action="open-pix-settings">Cancelar</button><button type="button" class="btn secondary" data-action="test-pix-form">Testar QR Code</button><button class="btn primary">Salvar configuração</button></div></form>`,id?'Editar configuração Pix':'Nova configuração Pix');
  }
  function normalizePixPayload221(value){return String(value||'').replace(/[\r\n\t]+/g,'').trim();}
  function pixCrc16Ccitt221(value){let crc=0xffff;for(let i=0;i<value.length;i++){crc^=value.charCodeAt(i)<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);crc&=0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
  function isValidPixPayload221(value){const code=normalizePixPayload221(value),marker=code.lastIndexOf('6304');if(code.length<30||!code.startsWith('000201')||marker<0||marker+8!==code.length||!code.includes('5802BR'))return false;return pixCrc16Ccitt221(code.slice(0,marker+4))===code.slice(marker+4).toUpperCase();}
  function pixCodeFor221(config){return normalizePixPayload221(config?.copyPasteCode||config?.pixKey||'');}
  async function copyText221(value){
    const text=String(value||'');if(!text)throw new Error('Não existe código Pix para copiar.');
    try{await navigator.clipboard.writeText(text);}catch(_){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();if(!document.execCommand('copy'))throw new Error('O navegador bloqueou a cópia.');ta.remove();}
    toast('Código Pix copiado.');
  }
  function showPixTest221(config){
    const code=pixCodeFor221(config);if(!code)throw new Error('Informe um código Pix válido antes de gerar o QR Code.');if(!window.MarcoQr)throw new Error('O gerador local de QR Code não foi carregado.');
    const dataUrl=MarcoQr.toDataURL(code,{size:520,margin:4,level:'Q'});mountPixOverlay221(`<div class="pix-test-v224"><div class="pix-qr-frame-v224"><img src="${attr(dataUrl)}" alt="QR Code Pix"></div><h3>${esc(config.name||'Teste do Pix')}</h3><p><strong>Favorecido:</strong> ${esc(config.beneficiary||'—')}<br><strong>Chave:</strong> ${esc(config.pixKey||'—')}</p><label class="field"><span>Código Pix Copia e Cola</span><textarea readonly rows="5">${esc(code)}</textarea></label><div class="form-actions"><button class="btn secondary" data-action="open-pix-settings">Voltar</button><button class="btn primary" data-action="copy-pix-raw" data-code="${attr(code)}">Copiar código Pix</button></div></div>`,'Testar QR Code');
  }


  async function restorePersonalization221(){if(!await confirmAction('Restaurar o layout da Nova OSV, a mensagem do WhatsApp e o modelo PDF padrão? Um backup será criado antes.'))return;const previousAssetKeys=allTemplateAssetKeys221();await MarcoStorage.createBackup(STATE,'antes-restaurar-personalizacao-v2.2.4');settings().osvLayout=defaultOrderLayout();settings().clientFormLayout=defaultClientLayout();settings().whatsappMessageTemplate=DEFAULT_MESSAGE;const preserved=activeTemplates().filter(t=>t.id!=='pdf-template-default');settings().pdfTemplates=[professionalTemplates221()[0],...preserved];settings().defaultPdfTemplateId='pdf-template-default';settings().pdfTemplates.forEach(t=>t.isDefault=t.id==='pdf-template-default');await persist('Personalização restaurada ao padrão','Layouts, mensagem e modelo PDF');await cleanupUnreferencedTemplateMedia221(previousAssetKeys);renderView();toast('Configurações visuais restauradas.');}

  async function handleAction221(btn,base){const a=btn.dataset.action;
    if(a==='close-modal'&&pdfEditor){if(pdfEditor.dirty&&!await confirmAction('Descartar as alterações deste modelo?'))return;await cleanupStagedPdfMedia221(false);closePdfEditorAssets221();pdfEditor=null;return await base(btn);}
    if(a==='close-modal'&&orderLayoutEditor){if(orderLayoutEditor.dirty&&!await confirmAction('Descartar as alterações deste layout?'))return;const cfg=currentLayoutConfig221(),ticket=orderLayoutEditor.returnTo;orderLayoutEditor=null;const result=await base(btn);cfg.resume?.(ticket);return result;}
    if(a==='open-osv-layout-editor'){
      // Mesmo editor, mesmo estado, mesma persistência nos dois acessos. A única diferença é que,
      // vindo da Nova OSV, o formulário é preservado no rascunho e reaberto ao fechar o editor.
      const insideOrder=!!btn.closest('.modal')?.querySelector('form[data-form="order"]');
      if(!insideOrder){openOrderLayoutEditor221(null);return;}
      // openModal reescreve #modal-root: sem a ponte, o formulário da OSV seria descartado sem
      // rascunho. Melhor não abrir o editor do que perder o que já foi preenchido.
      if(typeof window.MarcoOrderFormBridge?.suspend!=='function')throw new Error('Não foi possível preservar os dados da OSV. O editor não foi aberto.');
      const ticket=await window.MarcoOrderFormBridge.suspend();
      openOrderLayoutEditor221(ticket||null);
      return;
    }
    if(a==='open-client-layout-editor'){
      const insideClient=!!btn.closest('.modal')?.querySelector('form[data-form="client"]');
      if(!insideClient){openClientLayoutEditor221(null);return;}
      if(typeof window.MarcoClientFormBridge?.suspend!=='function')throw new Error('Não foi possível preservar os dados do cliente. O editor não foi aberto.');
      const ticket=await window.MarcoClientFormBridge.suspend();openClientLayoutEditor221(ticket||null);return;
    }
    if(a==='open-pdf-templates'){openPdfTemplates221();return;}
    if(a==='open-pix-settings'){openPixManager221();return;}
    if(a==='pix-overlay-close'){btn.closest('[data-pix-overlay]')?.remove();return;}
    if(a==='new-pix-config'){openPixConfigForm221();return;}
    if(a==='edit-pix-config'){openPixConfigForm221(btn.dataset.id);return;}
    if(a==='copy-pix-code'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);await copyText221(pixCodeFor221(config));return;}
    if(a==='copy-pix-raw'){await copyText221(btn.dataset.code||'');return;}
    if(a==='test-pix-config'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(config)showPixTest221(config);return;}
    if(a==='test-pix-form'){const form=btn.closest('form'),values=Object.fromEntries(new FormData(form));showPixTest221(values);return;}
    if(a==='set-default-pix'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(!config)return;settings().defaultPixConfigurationId=config.id;(settings().pixConfigurations||[]).forEach(x=>x.isDefault=x.id===config.id);await persist('Pix padrão alterado',config.name||config.beneficiary||config.id);openPixManager221();return;}
    if(a==='delete-pix-config'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(!config)return;if(!await confirmAction('Excluir esta configuração Pix? OSVs antigas manterão a cópia já salva.'))return;settings().pixConfigurations=settings().pixConfigurations.filter(x=>x.id!==config.id);if(settings().defaultPixConfigurationId===config.id)settings().defaultPixConfigurationId=settings().pixConfigurations[0]?.id||'';await persist('Configuração Pix excluída',config.name||config.id);openPixManager221();return;}
    if(a==='open-whatsapp-template'){openWhatsappTemplate221();return;}
    if(a==='restore-personalization-defaults'){await restorePersonalization221();return;}
    if(a==='insert-whatsapp-variable'){const area=btn.closest('form')?.elements.template;if(area){const start=area.selectionStart||area.value.length,end=area.selectionEnd||start;area.setRangeText(btn.dataset.variable,start,end,'end');area.focus();}return;}
    if(a==='restore-whatsapp-template'){const area=btn.closest('form')?.elements.template;if(area)area.value=DEFAULT_MESSAGE;return;}
    if(a==='layout-view'){orderLayoutEditor.view=btn.dataset.view;orderLayoutEditor.selected.clear();renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-grid'){pushLayoutHistory();orderLayoutEditor.layout.showGrid=!orderLayoutEditor.layout.showGrid;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-snap'){pushLayoutHistory();orderLayoutEditor.layout.snapEnabled=!orderLayoutEditor.layout.snapEnabled;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-multi'){orderLayoutEditor.multiSelect=!orderLayoutEditor.multiSelect;if(!orderLayoutEditor.multiSelect&&orderLayoutEditor.selected.size>1){const keep=[...orderLayoutEditor.selected].at(-1);orderLayoutEditor.selected.clear();if(keep)orderLayoutEditor.selected.add(keep);}renderOrderLayoutEditor221();return;}
    if(a==='layout-lock-all'||a==='layout-unlock-all'){pushLayoutHistory();const lock=a==='layout-lock-all';orderLayoutEditor.layout.components.forEach(c=>c.locked=lock);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-preview'){orderLayoutEditor.preview=!orderLayoutEditor.preview;renderOrderLayoutEditor221();return;}
    if(a==='layout-undo'){if(orderLayoutEditor.history.length){orderLayoutEditor.future.push(cloneValue(orderLayoutEditor.layout));orderLayoutEditor.layout=orderLayoutEditor.history.pop();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();}return;}
    if(a==='layout-redo'){if(orderLayoutEditor.future.length){orderLayoutEditor.history.push(cloneValue(orderLayoutEditor.layout));orderLayoutEditor.layout=orderLayoutEditor.future.pop();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();}return;}
    if(a==='layout-reset'){const cfg=currentLayoutConfig221();if(!await confirmAction(cfg.resetPrompt))return;if(!orderLayoutEditor.backupCreated){await MarcoStorage.createBackup(STATE,`antes-restaurar-layout-${cfg.entity}-v2.2.13`);orderLayoutEditor.backupCreated=true;}pushLayoutHistory();orderLayoutEditor.layout=cfg.defaultLayout();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-cancel'){if(orderLayoutEditor.dirty&&!await confirmAction('Descartar as alterações deste layout?'))return;const cfg=currentLayoutConfig221(),ticket=orderLayoutEditor.returnTo;orderLayoutEditor=null;closeModal();cfg.resume?.(ticket);return;}
    if(a==='layout-save'){await saveOrderLayout221();return;}
    if(a==='layout-lock-selected'){pushLayoutHistory();const selected=selectedLayoutComponents(),lock=!selected.every(c=>c.locked);selected.forEach(c=>c.locked=lock);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-equal-width'||a==='layout-equal-height'){const selected=selectedLayoutComponents();if(selected.length<2)return;pushLayoutHistory();const ref=editorPosition(selected[0]);selected.slice(1).forEach(c=>{const p=editorPosition(c);if(a==='layout-equal-width')p.width=ref.width;else if(c.allowHeight)p.height=ref.height;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-align'){const selected=selectedLayoutComponents();if(selected.length<2)return;pushLayoutHistory();const ps=selected.map(editorPosition),mode=btn.dataset.align;const targets={left:Math.min(...ps.map(p=>p.x)),right:Math.max(...ps.map(p=>p.x+p.width)),center:(Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x+p.width)))/2,top:Math.min(...ps.map(p=>p.y)),bottom:Math.max(...ps.map(p=>p.y+p.height)),middle:(Math.min(...ps.map(p=>p.y))+Math.max(...ps.map(p=>p.y+p.height)))/2};selected.forEach(c=>{const p=editorPosition(c);if(mode==='left')p.x=targets.left;if(mode==='right')p.x=targets.right-p.width;if(mode==='center')p.x=targets.center-p.width/2;if(mode==='top')p.y=targets.top;if(mode==='bottom')p.y=targets.bottom-p.height;if(mode==='middle')p.y=targets.middle-p.height/2;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-distribute'){const selected=selectedLayoutComponents(),axis=btn.dataset.axis;if(selected.length<3)return;pushLayoutHistory();selected.sort((x,y)=>axis==='vertical'?editorPosition(x).y-editorPosition(y).y:editorPosition(x).x-editorPosition(y).x);const first=editorPosition(selected[0]),last=editorPosition(selected.at(-1)),size=c=>axis==='vertical'?editorPosition(c).height:editorPosition(c).width,total=selected.reduce((sum,c)=>sum+size(c),0),start=axis==='vertical'?first.y:first.x,end=axis==='vertical'?last.y+last.height:last.x+last.width,gap=(end-start-total)/(selected.length-1);let cursor=start;selected.forEach(c=>{const p=editorPosition(c);if(axis==='vertical')p.y=cursor;else p.x=cursor;setEditorPosition(c,p);cursor+=size(c)+gap;});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='create-pdf-template'){const id=uid('pdf-template'),name=`Projeto PDF ${activeTemplates().length+1}`,t=btn.dataset.mode==='blank'?createBlankPdfTemplate221(name,id):cloneValue(professionalTemplates221()[0]);t.id=id;t.name=name;t.isDefault=false;t.createdAt=t.updatedAt=new Date().toISOString();t.pages.forEach(page=>{page.id=uid('page');page.components.forEach(c=>c.id=uid('pdfc'));});settings().pdfTemplates.push(t);await persist('Modelo de PDF criado',name);await openPdfEditor221(id);return;}
    if(a==='edit-pdf-template'){await openPdfEditor221(btn.dataset.id);return;}
    if(a==='preview-pdf-template'){await openPdfEditor221(btn.dataset.id);requestAnimationFrame(()=>document.querySelector('[data-action="pdf-preview"]')?.click());return;}
    if(a==='duplicate-pdf-template'){const src=activeTemplates().find(x=>x.id===btn.dataset.id);if(!src)return;const t=cloneTemplateWithoutVersions(src);t.id=uid('pdf-template');t.name=`${src.name} — Cópia`;t.isDefault=false;t.version=1;t.createdAt=t.updatedAt=new Date().toISOString();settings().pdfTemplates.push(t);await persist('Modelo de PDF duplicado',t.name);openPdfTemplates221();return;}
    if(a==='set-default-pdf-template'){const target=activeTemplates().find(t=>t.id===btn.dataset.id);if(!target)throw new Error('O modelo selecionado não existe mais.');settings().defaultPdfTemplateId=target.id;activeTemplates().forEach(t=>t.isDefault=t.id===target.id);await persist('Modelo PDF padrão alterado',target.name);openPdfTemplates221();return;}
    if(a==='rename-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;openModal('Renomear modelo',`<form data-form="rename-pdf-template-v221" data-id="${attr(t.id)}"><div class="field"><label>Novo nome</label><input name="name" value="${attr(t.name)}" required></div><div class="form-actions"><button type="button" class="btn secondary" data-action="open-pdf-templates">Cancelar</button><button class="btn primary">Renomear</button></div></form>`);return;}
    if(a==='delete-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t||activeTemplates().length===1)return;if(t.id===settings().defaultPdfTemplateId)throw new Error('Defina outro modelo como padrão antes de excluir este.');const removedAssetKeys=templateAssetKeys221(t),linked=data().serviceOrders.filter(o=>o.pdfTemplateId===t.id).length;if(!await confirmAction(`${linked?`Este modelo é usado por ${linked} OSV(s). `:''}Os PDFs já gerados não serão alterados. Excluir para novas gerações?`))return;settings().pdfTemplates=settings().pdfTemplates.filter(x=>x.id!==t.id);data().serviceOrders.filter(o=>o.pdfTemplateId===t.id).forEach(o=>o.pdfTemplateId=settings().defaultPdfTemplateId);await persist('Modelo de PDF excluído',t.name);await cleanupUnreferencedTemplateMedia221(removedAssetKeys);openPdfTemplates221();return;}
    if(a==='pdf-template-history'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;openModal(`Histórico — ${t.name}`,`<div class="version-history-v221">${(t.versions||[]).map((v,index)=>`<article><div><strong>Versão ${v.version}</strong><small>${formatDateTime(v.createdAt)}</small></div><button class="btn secondary compact" data-action="pdf-restore-version" data-id="${attr(t.id)}" data-index="${index}">Restaurar</button></article>`).join('')||'<div class="empty">Nenhuma versão anterior.</div>'}<div class="form-actions"><button class="btn secondary" data-action="open-pdf-templates">Voltar</button></div></div>`,true);return;}
    if(a==='pdf-restore-version'){const t=activeTemplates().find(x=>x.id===btn.dataset.id),entry=t?.versions?.[Number(btn.dataset.index)];if(!t||!entry)return;if(!await confirmAction(`Restaurar a versão ${entry.version} de ${t.name}?`))return;const current=cloneTemplateWithoutVersions(t),restored=cloneTemplateWithoutVersions(entry.template);const versions=[{id:uid('pdfver'),version:t.version||1,createdAt:new Date().toISOString(),template:current},...(t.versions||[])].slice(0,10);Object.assign(t,restored,{id:t.id,name:t.name,isDefault:t.isDefault,version:(Number(t.version)||1)+1,updatedAt:new Date().toISOString(),versions});await persist('Versão de modelo PDF restaurada',`${t.name} · versão ${entry.version}`);openPdfTemplates221();return;}
    if(a==='export-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;const exported=await exportPdfTemplate221(t),json=JSON.stringify(exported,null,2);MarcoStorage.downloadBlob(new Blob([json],{type:'application/json'}),`Marco-Iris_Modelo-PDF_${t.name.replace(/[^\wÀ-ÿ-]+/g,'-')}.json`);toast('Modelo exportado com imagens incorporadas.');return;}
    if(a==='import-pdf-template'){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const importedKeys=[];try{const file=input.files?.[0];if(!file)return;if(file.size>MAX_TEMPLATE_IMPORT_BYTES)throw new Error('O modelo deve ter no máximo 25 MB.');const parsed=JSON.parse(await file.text()),incoming=sanitizePdfTemplate221(parsed.template||parsed);for(const page of incoming.pages||[])for(const c of page.components||[]){if(/^data:image\//i.test(c.assetUrl||'')){const blob=dataUrlToBlob221(c.assetUrl);if(blob.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error(`A imagem ${c.assetName||c.label||'do modelo'} ultrapassa 5 MB.`);const rec=await MarcoStorage.putMedia(blob,{name:c.assetName||`${c.label||'imagem'}.png`,type:blob.type});importedKeys.push(rec.id);c.assetLocalKey=rec.id;c.assetUrl='';}else if(c.assetLocalKey&&!await MarcoStorage.getMedia(c.assetLocalKey))c.assetLocalKey='';}const issues=validatePdfTemplate221(incoming);if(issues.length)throw new Error(`Modelo importado inválido: ${issues[0]}`);incoming.name=`${incoming.name||'Modelo importado'} — Importado`;settings().pdfTemplates.push(incoming);await persist('Modelo de PDF importado',incoming.name);openPdfTemplates221();}catch(error){for(const key of importedKeys)await MarcoStorage.deleteMedia(key).catch(()=>{});console.error('Falha ao importar modelo de PDF:',error);toast(error.message||'Não foi possível importar o modelo.','error');}finally{input.value='';}};input.click();return;}
    if(a==='pdf-toggle-snap'){pdfEditor.snapEnabled=!pdfEditor.snapEnabled;renderPdfEditor221();return;}
    if(a==='pdf-fit-page'){applyPdfZoom221('fit-page');return;}
    if(a==='pdf-fit-width'){applyPdfZoom221('fit-width');return;}
    if(a==='pdf-actual-size'){applyPdfZoom221('actual');return;}
    if(a==='pdf-zoom-reset'){pdfEditor.manualZoom=1;applyPdfZoom221('fit-page');return;}
    if(a==='pdf-zoom-in'||a==='pdf-zoom-out'){const current=pdfEditor.scale/actualPdfScale221(),delta=a==='pdf-zoom-in'?.1:-.1;applyPdfZoom221('manual',clamp(current+delta,.25,4));return;}
    if(a==='pdf-toggle-grid'){pdfEditor.showGrid=!pdfEditor.showGrid;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-toggle-guides'){pdfEditor.showGuides=!pdfEditor.showGuides;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-hand-tool'){pdfEditor.handTool=!pdfEditor.handTool;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-center-page'){const viewport=document.querySelector('[data-pdf-viewport]'),current=document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`);if(viewport&&current){viewport.scrollTo({left:Math.max(0,current.offsetLeft-(viewport.clientWidth-current.offsetWidth)/2),top:Math.max(0,current.offsetTop-(viewport.clientHeight-current.offsetHeight)/2),behavior:'smooth'});}return;}
    if(a==='pdf-toggle-left-panel'){pdfEditor.leftPanelCollapsed=!pdfEditor.leftPanelCollapsed;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-toggle-right-panel'){pdfEditor.rightPanelCollapsed=!pdfEditor.rightPanelCollapsed;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-show-panels'){pdfEditor.leftPanelCollapsed=false;pdfEditor.rightPanelCollapsed=false;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-toggle-fullscreen'){pdfEditor.fullscreen=!pdfEditor.fullscreen;updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-view-mode'){pdfEditor.viewMode=btn.dataset.mode==='all'?'all':'page';storePdfEditorPreferences221();if(pdfEditor.viewMode==='all'&&pdfEditor.zoomMode==='fit-page')pdfEditor.zoomMode='fit-width';pdfEditor.scale=computePdfScale221(pdfEditor.zoomMode);renderPdfEditor221();return;}
    if(a==='pdf-prev-page'||a==='pdf-next-page'){const delta=a==='pdf-prev-page'?-1:1;pdfEditor.pageIndex=clamp(pdfEditor.pageIndex+delta,0,pdfEditor.template.pages.length-1);pdfEditor.selectedId='';renderPdfEditor221();requestAnimationFrame(()=>document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`)?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}));return;}
    if(a==='pdf-align-page'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();const mm=pageMm221(),mode=btn.dataset.align;if(mode==='left')c.x=0;if(mode==='center')c.x=(mm.w-c.width)/2;if(mode==='right')c.x=mm.w-c.width;if(mode==='top')c.y=0;if(mode==='middle')c.y=(mm.h-c.height)/2;if(mode==='bottom')c.y=mm.h-c.height;pdfEditor.dirty=true;renderPdfEditor221();return;}
    if(a==='pdf-insert-variable'){const c=currentPdfComponent221(),select=document.querySelector('[data-pdf-variable-select]'),token=select?.value;if(!c||!token)return;pushPdfHistory221();c.text=`${c.text||''}${c.text?' ':''}${token}`;pdfEditor.dirty=true;renderPdfEditor221();return;}
    if(a==='pdf-page-select'){pdfEditor.pageIndex=Number(btn.dataset.index)||0;pdfEditor.selectedId='';renderPdfEditor221();requestAnimationFrame(()=>document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`)?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}));return;}
    if(a==='pdf-add-page'){pushPdfHistory221();pdfEditor.template.pages.push({id:uid('page'),name:`Página ${pdfEditor.template.pages.length+1}`,dynamic:false,components:[]});pdfEditor.pageIndex=pdfEditor.template.pages.length-1;renderPdfEditor221();return;}
    if(a==='pdf-duplicate-page'){pushPdfHistory221();const p=cloneValue(currentPdfPage221());p.id=uid('page');p.name=`${p.name} — Cópia`;p.components.forEach(c=>c.id=uid('pdfc'));pdfEditor.template.pages.splice(pdfEditor.pageIndex+1,0,p);pdfEditor.pageIndex++;renderPdfEditor221();return;}
    if(a==='pdf-move-page'){const direction=Number(btn.dataset.direction)||0,next=pdfEditor.pageIndex+direction;if(next<0||next>=pdfEditor.template.pages.length)return;pushPdfHistory221();const [page]=pdfEditor.template.pages.splice(pdfEditor.pageIndex,1);pdfEditor.template.pages.splice(next,0,page);pdfEditor.pageIndex=next;renderPdfEditor221();return;}
    if(a==='pdf-delete-page'){if(pdfEditor.template.pages.length===1)throw new Error('O modelo precisa ter pelo menos uma página.');if(!await confirmAction('Excluir esta página do modelo?'))return;pushPdfHistory221();pdfEditor.template.pages.splice(pdfEditor.pageIndex,1);pdfEditor.pageIndex=Math.max(0,pdfEditor.pageIndex-1);pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-add-component'){pushPdfHistory221();const type=btn.dataset.type,def=PDF_COMPONENT_LIBRARY[type],mm=pageMm221(),isGradient=type==='gradient',c={id:uid('pdfc'),type,label:def.label,x:isGradient?0:15,y:isGradient?0:15,width:isGradient?mm.w:def.width,height:isGradient?mm.h:def.height,locked:isGradient,zIndex:isGradient?Math.min(-100,...currentPdfPage221().components.map(x=>Number(x.zIndex)||0))-1:currentPdfPage221().components.length+1,opacity:1,...cloneValue(def)};if(isGradient){c.x=0;c.y=0;c.width=mm.w;c.height=mm.h;c.locked=true;}currentPdfPage221().components.push(c);pdfEditor.selectedId=c.id;renderPdfEditor221();return;}
    if(a==='pdf-delete-component'){if(!currentPdfComponent221())return;pushPdfHistory221();currentPdfPage221().components=currentPdfPage221().components.filter(c=>c.id!==pdfEditor.selectedId);pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-duplicate-component'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();const copy=cloneValue(c);copy.id=uid('pdfc');copy.x+=5;copy.y+=5;copy.zIndex=(Math.max(0,...currentPdfPage221().components.map(x=>x.zIndex||0))+1);currentPdfPage221().components.push(copy);pdfEditor.selectedId=copy.id;renderPdfEditor221();return;}
    if(a==='pdf-bring-front'||a==='pdf-send-back'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();c.zIndex=a==='pdf-bring-front'?Math.max(...currentPdfPage221().components.map(x=>x.zIndex||0))+1:Math.min(...currentPdfPage221().components.map(x=>x.zIndex||0))-1;renderPdfEditor221();return;}
    if(a==='pdf-choose-image'){const c=currentPdfComponent221();if(!c)return;const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error('A imagem deve ter no máximo 5 MB.');if(!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error('Use uma imagem PNG, JPEG ou WebP.');const rec=await MarcoStorage.putMedia(file,{name:file.name,type:file.type});pushPdfHistory221();if(c.assetLocalKey&&pdfEditor.stagedMediaKeys.has(c.assetLocalKey)){await MarcoStorage.deleteMedia(c.assetLocalKey).catch(error=>console.warn(error));pdfEditor.stagedMediaKeys.delete(c.assetLocalKey);}if(c.previewUrl){try{URL.revokeObjectURL(c.previewUrl);}catch(_){}pdfEditor.objectUrls.delete(c.previewUrl);}const url=URL.createObjectURL(file);pdfEditor.objectUrls.add(url);pdfEditor.stagedMediaKeys.add(rec.id);c.assetLocalKey=rec.id;c.assetName=file.name;c.previewUrl=url;delete c.assetUrl;pdfEditor.dirty=true;renderPdfEditor221();}catch(error){console.error('Falha ao adicionar imagem ao modelo:',error);toast(error.message||'Não foi possível adicionar a imagem.','error');}finally{input.value='';}};input.click();return;}
    if(a==='pdf-undo'){if(pdfEditor.history.length){pdfEditor.future.push(cloneValue(pdfEditor.template));pdfEditor.template=pdfEditor.history.pop();pdfEditor.pageIndex=Math.min(pdfEditor.pageIndex,pdfEditor.template.pages.length-1);renderPdfEditor221();}return;}
    if(a==='pdf-redo'){if(pdfEditor.future.length){pdfEditor.history.push(cloneValue(pdfEditor.template));pdfEditor.template=pdfEditor.future.pop();renderPdfEditor221();}return;}
    if(a==='pdf-reset'){if(!await confirmAction('Voltar este modelo ao padrão oficial? A versão atual permanecerá no histórico ao salvar.'))return;if(!pdfEditor.backupCreated){await MarcoStorage.createBackup(STATE,'antes-restaurar-modelo-pdf-v2.2.4');pdfEditor.backupCreated=true;}pushPdfHistory221();const official=professionalTemplates221().find(t=>t.designKey===pdfEditor.template.designKey)||professionalTemplates221()[0],restored=cloneValue(official);restored.id=pdfEditor.template.id;restored.name=pdfEditor.template.name;restored.isDefault=pdfEditor.template.isDefault;restored.versions=pdfEditor.template.versions||[];restored.pages.forEach(page=>{page.id=uid('page');page.components.forEach(c=>c.id=uid('pdfc'));});pdfEditor.template=restored;pdfEditor.pageIndex=0;pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-close-preview'){const overlay=btn.closest('[data-pdf-preview-overlay]');if(overlay){try{URL.revokeObjectURL(overlay.dataset.objectUrl||'');}catch(_){}overlay.remove();}return;}
    if(a==='pdf-preview'){await generatePdfPreview221(false);return;}
    if(a==='pdf-test'){await generatePdfPreview221(true);return;}
    if(a==='pdf-cancel'){if(pdfEditor.dirty&&!await confirmAction('Descartar as alterações deste modelo?'))return;await cleanupStagedPdfMedia221(false);closePdfEditorAssets221();pdfEditor=null;openPdfTemplates221();return;}
    if(a==='pdf-save-as'){const issues=validatePdfTemplate221(pdfEditor.template);if(issues.length){toast(issues[0],'error');return;}const copy=cloneTemplateWithoutVersions(pdfEditor.template);copy.id=uid('pdf-template');copy.name=`${pdfEditor.template.name} — Novo`;copy.isDefault=false;copy.version=1;copy.createdAt=copy.updatedAt=new Date().toISOString();copy.versions=[];settings().pdfTemplates.push(copy);await persist('Modelo de PDF salvo como novo',copy.name);await cleanupStagedPdfMedia221(true);closePdfEditorAssets221();pdfEditor=null;openPdfTemplates221();toast('Novo modelo criado.');return;}
    if(a==='pdf-save'){await savePdfTemplate221();return;}
    if(a==='whatsapp-review-copy'||a==='whatsapp-review-ok'){const captured=captureWhatsappTemplate221(btn);let result;try{result=await base(btn);}finally{if(captured)await persist('Mensagem do WhatsApp atualizada','Modelo confirmado pelo usuário',{folder:false,google:true});}return result;}
    return await base(btn);
  }

  async function handleSubmit221(form,base){if(form.dataset.form==='pix-config-v224'){const v=Object.fromEntries(new FormData(form)),id=form.dataset.id||uid('pix'),old=(settings().pixConfigurations||[]).find(x=>x.id===id),code=String(v.copyPasteCode||'').trim();if(!String(v.name||'').trim()||!String(v.beneficiary||'').trim()||!String(v.pixKey||'').trim()||!code)throw new Error('Preencha nome, favorecido, chave e código Pix Copia e Cola.');if(!isValidPixPayload221(code))throw new Error('O código Pix Copia e Cola é inválido. Revise o payload completo antes de salvar.');const item={id,name:String(v.name).trim(),beneficiary:String(v.beneficiary).trim(),beneficiaryDocument:String(v.beneficiaryDocument||'').trim(),bankName:String(v.bankName||'').trim(),keyType:String(v.keyType||'').trim(),pixKey:String(v.pixKey).trim(),city:String(v.city||'').trim(),description:String(v.description||'').trim(),copyPasteCode:normalizePixPayload221(code),active:v.active==='on',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};settings().pixConfigurations=settings().pixConfigurations||[];if(old)Object.assign(old,item);else settings().pixConfigurations.push(item);if(!settings().defaultPixConfigurationId)settings().defaultPixConfigurationId=id;settings().pixConfigurations.forEach(x=>x.isDefault=x.id===settings().defaultPixConfigurationId);await persist(old?'Configuração Pix atualizada':'Configuração Pix criada',item.name);openPixManager221();toast('Configuração Pix salva.');return;}if(form.dataset.form==='whatsapp-template-v221'){const value=String(form.elements.template.value||'').trim();if(!value)throw new Error('A mensagem não pode ficar vazia.');settings().whatsappMessageTemplate=value;settings().whatsappMessageUpdatedAt=new Date().toISOString();await persist('Mensagem padrão do WhatsApp salva','Personalização');closeModal();renderView();toast('Mensagem padrão salva.');return;}if(form.dataset.form==='rename-pdf-template-v221'){const t=activeTemplates().find(x=>x.id===form.dataset.id),name=String(form.elements.name.value||'').trim();if(!t||!name)throw new Error('Informe um nome válido.');t.name=name;t.updatedAt=new Date().toISOString();await persist('Modelo de PDF renomeado',name);openPdfTemplates221();return;}return await base(form);}

  function installEventHandlers221(){
    document.addEventListener('pointerdown',event=>{
      const layoutEl=event.target.closest('.layout-component-v221');
      if(layoutEl&&orderLayoutEditor){
        const dir=event.target.closest('[data-resize-dir]')?.dataset.resizeDir||'';
        selectLayoutComponent221(layoutEl.dataset.componentId,event,false);startLayoutInteraction221(event,layoutEl,dir);
        document.querySelectorAll('.layout-component-v221').forEach(el=>el.classList.toggle('selected',orderLayoutEditor.selected.has(el.dataset.componentId)));
        renderLayoutProperties221();updateLayoutToolbar221();return;
      }
      if(orderLayoutEditor&&event.target.matches('[data-layout-editor-canvas]')){orderLayoutEditor.selected.clear();renderOrderLayoutEditor221();return;}
      const viewport=event.target.closest('[data-pdf-viewport]');
      const pdfEl=event.target.closest('.pdf-component-v221');
      if(pdfEditor&&viewport&&!pdfEl&&(pdfEditor.handTool||pdfEditor.spacePressed)){
        pdfEditor.panInteraction={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startLeft:viewport.scrollLeft,startTop:viewport.scrollTop};
        viewport.classList.add('is-panning');
        try{viewport.setPointerCapture?.(event.pointerId);}catch(_){}event.preventDefault();return;
      }
      if(pdfEl&&pdfEditor){
        const pageWrap=pdfEl.closest('[data-pdf-page-index]');
        if(pageWrap)pdfEditor.pageIndex=clamp(Number(pageWrap.dataset.pdfPageIndex)||0,0,pdfEditor.template.pages.length-1);
        pdfEditor.selectedId=pdfEl.dataset.pdfComponentId;document.querySelectorAll('.pdf-component-v221').forEach(el=>el.classList.toggle('selected',el===pdfEl));renderPdfProperties221();
        const c=currentPdfComponent221();if(c?.locked)return;pushPdfHistory221();const dir=event.target.closest('[data-pdf-resize]')?.dataset.pdfResize||'';
        pdfEditor.interaction={id:c.id,dir,startX:event.clientX,startY:event.clientY,start:cloneValue(c),pageIndex:pdfEditor.pageIndex};
        try{pdfEl.setPointerCapture?.(event.pointerId);}catch(_){}event.preventDefault();
      }
    },true);
    document.addEventListener('pointermove',event=>{
      if(orderLayoutEditor?.interaction){moveLayoutInteraction221(event);return;}
      if(pdfEditor?.panInteraction){
        const viewport=document.querySelector('[data-pdf-viewport]'),it=pdfEditor.panInteraction;if(!viewport)return;
        viewport.scrollLeft=it.startLeft-(event.clientX-it.startX);viewport.scrollTop=it.startTop-(event.clientY-it.startY);event.preventDefault();return;
      }
      if(pdfEditor?.interaction){
        const it=pdfEditor.interaction;if(Number.isInteger(it.pageIndex))pdfEditor.pageIndex=it.pageIndex;
        const c=currentPdfComponent221();if(!c)return;const scale=Math.max(.01,pdfEditor.scale),dx=(event.clientX-it.startX)/scale,dy=(event.clientY-it.startY)/scale,mm=pageMm221();let next={...it.start};
        if(it.dir){
          const dir=it.dir;
          if(dir.includes('e'))next.width=it.start.width+dx;
          if(dir.includes('s'))next.height=it.start.height+dy;
          if(dir.includes('w')){next.x=it.start.x+dx;next.width=it.start.width-dx;}
          if(dir.includes('n')){next.y=it.start.y+dy;next.height=it.start.height-dy;}
          if(c.lockAspectRatio!==false&&['image','logo','pix-qr'].includes(c.type)){
            const ratio=Math.max(.01,it.start.width/Math.max(.01,it.start.height));
            if(Math.abs(dx/Math.max(1,it.start.width))>=Math.abs(dy/Math.max(1,it.start.height))){next.height=next.width/ratio;if(dir.includes('n'))next.y=it.start.y+(it.start.height-next.height);}else{next.width=next.height*ratio;if(dir.includes('w'))next.x=it.start.x+(it.start.width-next.width);}
          }
        }else{next.x=it.start.x+dx;next.y=it.start.y+dy;}
        const minW=c.type==='pix-qr'?30:5,minH=c.type==='pix-qr'?30:3;
        if(next.width<minW){if(it.dir?.includes('w'))next.x-=minW-next.width;next.width=minW;}
        if(next.height<minH){if(it.dir?.includes('n'))next.y-=minH-next.height;next.height=minH;}
        next.x=clamp(next.x,0,Math.max(0,mm.w-minW));next.y=clamp(next.y,0,Math.max(0,mm.h-minH));
        next.width=clamp(next.width,minW,mm.w-next.x);next.height=clamp(next.height,minH,mm.h-next.y);
        next=snapPdfPosition221(c,next,it.dir?'resize':'move');Object.assign(c,next);updatePdfComponentVisual221(c,document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`));return;
      }
    },true);
    document.addEventListener('pointerup',event=>{
      endLayoutInteraction221();
      if(pdfEditor?.panInteraction){document.querySelector('[data-pdf-viewport]')?.classList.remove('is-panning');pdfEditor.panInteraction=null;}
      if(pdfEditor?.interaction){pdfEditor.interaction=null;pdfEditor.dirty=true;showPdfGuides221();renderPdfEditor221();}
    },true);
    document.addEventListener('input',event=>{
      if(orderLayoutEditor&&event.target.matches('[data-layout-prop]')){
        const c=selectedLayoutComponents()[0];if(!c)return;const p=editorPosition(c),key=event.target.dataset.layoutProp,value=Number(event.target.value);if(Number.isFinite(value)){ensureInputHistory221(event.target,'layout');p[key]=value;setEditorPosition(c,p);orderLayoutEditor.dirty=true;updateLayoutComponentVisual221(c);updateLayoutToolbar221();}return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-prop]')){
        const c=currentPdfComponent221();if(!c)return;const key=event.target.dataset.pdfProp,value=event.target.type==='number'?Number(event.target.value):event.target.value;if(event.target.type!=='number'||Number.isFinite(value)){ensureInputHistory221(event.target,'pdf');c[key]=value;pdfEditor.dirty=true;updatePdfComponentVisual221(c);}return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-template-prop]')){
        const key=event.target.dataset.pdfTemplateProp,value=event.target.value;ensureInputHistory221(event.target,'pdf');if(key==='name')pdfEditor.template.name=value;else if(key==='quality')pdfEditor.template.quality=value;else pdfEditor.template.page[key]=value;pdfEditor.dirty=true;return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-margin]')){
        ensureInputHistory221(event.target,'pdf');pdfEditor.template.page.margins=pdfEditor.template.page.margins||{};pdfEditor.template.page.margins[event.target.dataset.pdfMargin]=Number(event.target.value)||0;pdfEditor.dirty=true;
      }
    },true);
    document.addEventListener('change',event=>{
      if(pdfEditor&&event.target.matches('[data-pdf-zoom-select]')){const raw=String(event.target.value||'');if(['fit-page','fit-width','actual'].includes(raw))applyPdfZoom221(raw);else{const value=Number(raw);if(Number.isFinite(value))applyPdfZoom221('manual',value);}return;}
      if(event.target.matches('[data-include-pix]')){const options=event.target.closest('form')?.querySelector('[data-pix-order-options]');if(options)options.hidden=!event.target.checked;return;}
      if(orderLayoutEditor&&event.target.matches('[data-layout-prop-check]')){const c=selectedLayoutComponents()[0];if(!c)return;pushLayoutHistory();c[event.target.dataset.layoutPropCheck]=event.target.checked;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      if(orderLayoutEditor&&event.target.matches('[data-layout-mobile-span]')){const c=selectedLayoutComponents()[0];if(!c)return;pushLayoutHistory();c.mobile.span=Number(event.target.value);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      if(pdfEditor&&event.target.matches('[data-pdf-prop-check]')){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();c[event.target.dataset.pdfPropCheck]=event.target.checked;pdfEditor.dirty=true;renderPdfEditor221();return;}
      if(pdfEditor&&event.target.matches('[data-pdf-template-prop="size"],[data-pdf-template-prop="orientation"]')){ensureInputHistory221(event.target,'pdf');const key=event.target.dataset.pdfTemplateProp;pdfEditor.template.page[key]=event.target.value;pdfEditor.dirty=true;renderPdfEditor221();return;}
      if(pdfEditor&&event.target.matches('select[data-pdf-prop]')){const c=currentPdfComponent221();if(!c)return;ensureInputHistory221(event.target,'pdf');c[event.target.dataset.pdfProp]=event.target.value;pdfEditor.dirty=true;renderPdfEditor221();return;}
    },true);
    document.addEventListener('focusout',event=>{if(event.target?.dataset?.history221)delete event.target.dataset.history221;},true);
    document.addEventListener('keydown',event=>{
      if(orderLayoutEditor){
        if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();const redo=event.key.toLowerCase()==='y'||event.shiftKey;document.querySelector(`[data-action="${redo?'layout-redo':'layout-undo'}"]`)?.click();return;}
        const selected=selectedLayoutComponents();if(selected.length&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!event.target.matches('input,textarea,select')){event.preventDefault();pushLayoutHistory();const step=event.shiftKey?10:1;selected.forEach(c=>{const p=editorPosition(c);if(event.key==='ArrowLeft')p.x-=step;if(event.key==='ArrowRight')p.x+=step;if(event.key==='ArrowUp')p.y-=step;if(event.key==='ArrowDown')p.y+=step;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      }
      if(pdfEditor){
        const editing=event.target.matches('input,textarea,select,[contenteditable="true"]'),mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase(),c=currentPdfComponent221();
        if(event.key==='Escape'&&pdfEditor.fullscreen&&!editing){event.preventDefault();event.stopImmediatePropagation();pdfEditor.fullscreen=false;updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
        if(event.code==='Space'&&!editing){event.preventDefault();pdfEditor.spacePressed=true;document.querySelector('[data-pdf-viewport]')?.classList.add('space-pan-ready');return;}
        if(mod&&['z','y'].includes(key)){event.preventDefault();const redo=key==='y'||event.shiftKey;document.querySelector(`[data-action="${redo?'pdf-redo':'pdf-undo'}"]`)?.click();return;}
        if(mod&&key==='d'&&c){event.preventDefault();document.querySelector('[data-action="pdf-duplicate-component"]')?.click();return;}
        if(mod&&key==='c'&&c){event.preventDefault();pdfEditor.clipboard=cloneValue(c);return;}
        if(mod&&key==='v'&&pdfEditor.clipboard){event.preventDefault();pushPdfHistory221();const copy=cloneValue(pdfEditor.clipboard);copy.id=uid('pdfc');copy.x+=4;copy.y+=4;copy.zIndex=Math.max(0,...currentPdfPage221().components.map(x=>x.zIndex||0))+1;currentPdfPage221().components.push(copy);pdfEditor.selectedId=copy.id;renderPdfEditor221();return;}
        if(c&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!event.target.matches('input,textarea,select')){event.preventDefault();pushPdfHistory221();const step=event.shiftKey?5:.5;if(event.key==='ArrowLeft')c.x-=step;if(event.key==='ArrowRight')c.x+=step;if(event.key==='ArrowUp')c.y-=step;if(event.key==='ArrowDown')c.y+=step;const mm=pageMm221();c.x=clamp(c.x,0,mm.w-c.width);c.y=clamp(c.y,0,mm.h-c.height);pdfEditor.dirty=true;renderPdfEditor221();return;}
        if(event.key==='Delete'&&c&&!event.target.matches('input,textarea,select')){event.preventDefault();document.querySelector('[data-action="pdf-delete-component"]')?.click();}
      }
    },true);
    document.addEventListener('keyup',event=>{if(pdfEditor&&event.code==='Space'){pdfEditor.spacePressed=false;document.querySelector('[data-pdf-viewport]')?.classList.remove('space-pan-ready');}},true);
    document.addEventListener('wheel',event=>{if(!pdfEditor||(event.ctrlKey||event.metaKey)===false)return;const viewport=event.target.closest('[data-pdf-viewport]');if(!viewport)return;event.preventDefault();const current=(pdfEditor.scale||actualPdfScale221())/actualPdfScale221(),next=clamp(current+(event.deltaY<0?.1:-.1),.25,4);applyPdfZoom221('manual',next);},{capture:true,passive:false});
    document.addEventListener('touchstart',event=>{if(!pdfEditor||event.touches.length!==2||!event.target.closest('[data-pdf-viewport]'))return;const [a,b]=event.touches;pdfEditor.pinch={distance:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),zoom:(pdfEditor.scale||actualPdfScale221())/actualPdfScale221()};},{capture:true,passive:true});
    document.addEventListener('touchmove',event=>{if(!pdfEditor?.pinch||event.touches.length!==2||!event.target.closest('[data-pdf-viewport]'))return;const [a,b]=event.touches,distance=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);if(!distance||!pdfEditor.pinch.distance)return;event.preventDefault();const next=clamp(pdfEditor.pinch.zoom*(distance/pdfEditor.pinch.distance),.25,4);if(!pdfEditor.pinchFrame)pdfEditor.pinchFrame=requestAnimationFrame(()=>{pdfEditor.pinchFrame=0;applyPdfZoom221('manual',next);});},{capture:true,passive:false});
    document.addEventListener('touchend',event=>{if(pdfEditor&&event.touches.length<2)pdfEditor.pinch=null;},{capture:true,passive:true});
    window.addEventListener('service-order-layout-updated',()=>{const form=document.querySelector('#modal-root form[data-form="order"]');if(form)requestAnimationFrame(()=>applyOrderLayout221(form));});
    window.addEventListener('client-form-layout-updated',()=>{const form=document.querySelector('#modal-root form[data-form="client"]');if(form)requestAnimationFrame(()=>applyClientLayout221(form));});
    let resizeFrame=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{const order=document.querySelector('#modal-root form[data-form="order"]'),client=document.querySelector('#modal-root form[data-form="client"]');if(order)applyOrderLayout221(order);if(client)applyClientLayout221(client);});},{passive:true});
  }

  function install(){if(installed)return;installed=true;
    const baseNormalize=normalizeState;normalizeState=function(){baseNormalize();return ensureState221();};
    const baseRenderSettings=renderSettings;renderSettings=function(){ensureState221();return baseRenderSettings();};
    // openOrderForm resolve o rascunho de forma assíncrona (MarcoStorage.getDraft), então um único
    // requestAnimationFrame depois da chamada não encontra o formulário e o layout salvo nunca era aplicado.
    // O observer garante a hidratação assim que o formulário existir, seja no caminho síncrono ou no assíncrono.
    const baseOpenOrderForm=openOrderForm;openOrderForm=function(id='',prefill={}){baseOpenOrderForm(id,prefill);requestAnimationFrame(hydrateOrderForm221);};
    const baseOpenClientForm=openClientForm;openClientForm=function(id=''){baseOpenClientForm(id);requestAnimationFrame(()=>hydrateClientForm221());};
    watchOrderForm221();watchClientForm221();
    const baseSaveOrderForm=saveOrderForm;saveOrderForm=async function(form){return await baseSaveOrderForm(form);};
    const baseHandleAction=handleAction;handleAction=async function(btn){const action=btn?.dataset?.action||'',guarded=new Set(['create-pdf-template','duplicate-pdf-template','set-default-pdf-template','delete-pdf-template','export-pdf-template','import-pdf-template','pdf-restore-version','pdf-save','pdf-save-as','pdf-reset','layout-save','layout-reset','restore-personalization-defaults']),key=`${action}:${btn?.dataset?.id||''}`;if(guarded.has(action)&&ACTION_INFLIGHT_221.has(key))return;if(guarded.has(action)){ACTION_INFLIGHT_221.add(key);if(btn?.isConnected)btn.disabled=true;}try{return await handleAction221(btn,baseHandleAction);}catch(e){console.error('Ação v2.2.13 falhou:',e);toast(e.message||'Não foi possível concluir a ação.','error');}finally{if(guarded.has(action)){ACTION_INFLIGHT_221.delete(key);if(btn?.isConnected)btn.disabled=false;}}};
    const baseHandleSubmit=handleSubmit;handleSubmit=async function(form){try{return await handleSubmit221(form,baseHandleSubmit);}catch(e){console.error('Formulário v2.2.13 falhou:',e);toast(e.message||'Não foi possível salvar.','error');}};
    installEventHandlers221();watchWhatsappReview221();
    window.MarcoPersonalization221={version:VERSION,defaultOrderLayout,defaultClientLayout,defaultPdfTemplate,professionalTemplates:professionalTemplates221,ensureState:ensureState221,renderPersonalizationCards:personalizationCards,renderMessage:renderVariableTemplate,validateLayout:validateLayout221,validatePdfTemplate:validatePdfTemplate221,sanitizePdfTemplate:sanitizePdfTemplate221,openLayoutEditor:openOrderLayoutEditor221,openClientLayoutEditor:openClientLayoutEditor221,hydrateClientForm:hydrateClientForm221,applyClientLayout:applyClientLayout221,openPdfTemplates:openPdfTemplates221,snapshotPixFromForm:snapshotPixFromForm221,openPixSettings:openPixManager221,validatePixPayload:isValidPixPayload221};
  }

  window.MarcoPersonalization221={install,version:VERSION,defaultOrderLayout,defaultClientLayout,defaultPdfTemplate,professionalTemplates:professionalTemplates221};
})();
