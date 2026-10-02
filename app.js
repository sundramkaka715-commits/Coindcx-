const $=id=>document.getElementById(id);
let markets=[],busy=false,timer=null;
const PERIOD=14;

function calcRSI(values){
  const out=Array(values.length).fill(null); if(values.length<=PERIOD)return out;
  let gains=0,losses=0;
  for(let i=1;i<=PERIOD;i++){const d=values[i]-values[i-1];gains+=Math.max(d,0);losses+=Math.max(-d,0);}
  let avgGain=gains/PERIOD,avgLoss=losses/PERIOD;
  out[PERIOD]=avgLoss===0?100:100-100/(1+avgGain/avgLoss);
  for(let i=PERIOD+1;i<values.length;i++){const d=values[i]-values[i-1];avgGain=(avgGain*(PERIOD-1)+Math.max(d,0))/PERIOD;avgLoss=(avgLoss*(PERIOD-1)+Math.max(-d,0))/PERIOD;out[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss);}
  return out;
}

function findPivots(values){
  const lows=[],highs=[];
  for(let i=1;i<values.length-1;i++){
    if(values[i]<values[i-1]&&values[i]<=values[i+1])lows.push(i);
    if(values[i]>values[i-1]&&values[i]>=values[i+1])highs.push(i);
  }
  return{lows,highs};
}

function detect(raw,minGap,maxGap){
  const candles=[...raw].sort((a,b)=>Number(a.time)-Number(b.time));
  if(candles.length<60)return null;
  const closes=candles.map(x=>Number(x.close));
  const lowsPrice=candles.map(x=>Number(x.low));
  const highsPrice=candles.map(x=>Number(x.high));
  const rsi=calcRSI(closes);
  const lows=findPivots(lowsPrice).lows;
  const highs=findPivots(highsPrice).highs;
  const confirmedMax=candles.length-3;
  const usableLows=lows.filter(i=>i<=confirmedMax&&rsi[i]!==null);
  const usableHighs=highs.filter(i=>i<=confirmedMax&&rsi[i]!==null);

  for(let b=usableLows.length-1;b>=0;b--){
    const second=usableLows[b];
    for(let a=b-1;a>=0;a--){
      const first=usableLows[a],gap=second-first;
      if(gap>maxGap)break;
      if(gap>=minGap&&lowsPrice[second]<lowsPrice[first]&&rsi[second]>rsi[first])
        return{side:'BULLISH',price:lowsPrice[second],rsi:rsi[second],gap,time:candles[second].time};
    }
  }
  for(let b=usableHighs.length-1;b>=0;b--){
    const second=usableHighs[b];
    for(let a=b-1;a>=0;a--){
      const first=usableHighs[a],gap=second-first;
      if(gap>maxGap)break;
      if(gap>=minGap&&highsPrice[second]>highsPrice[first]&&rsi[second]<rsi[first])
        return{side:'BEARISH',price:highsPrice[second],rsi:rsi[second],gap,time:candles[second].time};
    }
  }
  return null;
}

async function getJSON(url){const r=await fetch(url);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d;}
async function loadMarkets(){markets=await getJSON('/api/markets');$('coins').textContent=markets.length;}

async function scan(){
  if(busy)return; busy=true; $('scanBtn').disabled=true; $('status').textContent='15m movers खोज रहे हैं…';
  try{
    if(!markets.length)await loadMarkets();
    const lim=$('marketLimit').value;
    const marketSet=lim==='all'?[...markets]:markets.slice(0,Number(lim));
    let next=0; const movers=[];
    async function moverWorker(){
      while(true){
        const i=next++; if(i>=marketSet.length)return;
        const m=marketSet[i];
        try{
          const candles=await getJSON('/api/candles?pair='+encodeURIComponent(m.pair)+'&interval=1m');
          if(candles.length<16)return;
          const recent=candles.slice(-16);
          const base=Number(recent[0].open),last=Number(recent[recent.length-1].close);
          if(base>0)movers.push({m,candles,move:(last-base)/base*100});
        }catch(e){}
      }
    }
    await Promise.all([moverWorker(),moverWorker(),moverWorker(),moverWorker(),moverWorker(),moverWorker()]);
    movers.sort((a,b)=>Math.abs(b.move)-Math.abs(a.move));
    const top=movers.slice(0,Number($('topCount').value));
    $('status').textContent='15m movers: '+top.length+' • 1m RSI scan…';
    const out=[];
    for(const x of top){
      const signal=detect(x.candles,1,18);
      if(signal)out.push({...signal,symbol:x.m.symbol,tf:'1m',move:x.move});
    }
    out.sort((a,b)=>Number(b.time)-Number(a.time)); render(out);
    $('status').textContent='Done • '+out.length+' confirmed signal(s) • Top '+top.length+' 15m movers scanned';
    $('updated').textContent='Updated '+new Date().toLocaleTimeString('en-IN');
  }catch(e){$('status').textContent='Error: '+e.message;$('rows').innerHTML='<tr><td colspan="7" class="empty">'+e.message+'</td></tr>';}
  finally{busy=false;$('scanBtn').disabled=false;}
}

function render(signals){
  $('total').textContent=signals.length;$('bull').textContent=signals.filter(x=>x.side==='BULLISH').length;$('bear').textContent=signals.filter(x=>x.side==='BEARISH').length;
  if(!signals.length){$('rows').innerHTML='<tr><td colspan="7" class="empty">Top movers में 1–18 candle gap वाला confirmed 1m RSI divergence नहीं मिला.</td></tr>';return;}
  $('rows').innerHTML=signals.map(x=>'<tr><td><b>'+x.symbol+'</b></td><td>'+x.tf+'</td><td class="'+(x.side==='BULLISH'?'bull':'bear')+'">'+x.side+'</td><td>'+Number(x.price).toPrecision(8)+'</td><td>'+Number(x.rsi).toFixed(2)+'</td><td>'+x.gap+'</td><td>'+new Date(Number(x.time)).toLocaleString('en-IN',{hour12:false})+'</td></tr>').join('');
}

$('scanBtn').addEventListener('click',scan);$('refresh').addEventListener('change',()=>{clearInterval(timer);const m=Number($('refresh').value);if(m>0)timer=setInterval(scan,m);});$('tf').addEventListener('change',scan);$('marketLimit').addEventListener('change',scan);
(async()=>{try{await loadMarkets();await scan();const m=Number($('refresh').value);if(m>0)timer=setInterval(scan,m);}catch(e){$('status').textContent='Error: '+e.message;}})();
