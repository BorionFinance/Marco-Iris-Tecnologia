(() => {
  'use strict';
  function localDay(date=new Date()){const p=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`;}
  function dateOnly(value){const raw=String(value||'').trim();const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return br?`${br[3]}-${br[2]}-${br[1]}`:'';}
  function effectiveStatus(payment={},at=new Date()){
    const stored=String(payment.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(payment.cancelled===true||stored==='cancelado'||stored==='cancelada')return 'Cancelado';
    if(dateOnly(payment.paymentDate))return 'Pago';
    const due=dateOnly(payment.dueDate);if(due)return due<localDay(at)?'Vencido':'Em aberto — aguardando pagamento';
    return 'Em aberto';
  }
  function tone(status){const value=String(status||'').toLowerCase();if(value==='pago')return 'ok';if(value==='vencido')return 'danger';if(value==='cancelado')return 'neutral';return 'warn';}
  window.MarcoFinanceStatus={effectiveStatus,tone,localDay,dateOnly};
})();
