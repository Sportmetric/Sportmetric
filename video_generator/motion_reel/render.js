const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{
 const mode=process.argv[2]; const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920}});
 p.on('console',m=>console.log('console:',m.text())); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/'+(process.env.HTML||'reel.html')); await p.evaluate(()=>window.ready);
 const total=await p.evaluate(()=>window.TOTAL);
 const el=await p.$('canvas');
 if(mode==='preview'){const ts=process.argv.slice(3).map(Number);
   for(const t of ts){await p.evaluate(t=>draw(t),t);await el.screenshot({path:`pv_${t}.png`})}
 } else {
   const out=process.argv[3]; const fps=30,n=Math.round(total*fps);
   const ff=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','30','-i','-','-f','lavfi','-i','anullsrc=r=44100:cl=stereo',
     '-map','0:v','-map','1:a','-shortest','-c:v','libx264','-profile:v','main','-level','4.1','-pix_fmt','yuv420p','-crf','18','-preset','slow',
     '-c:a','aac','-b:a','128k','-movflags','+faststart','-tag:v','avc1',out],{stdio:['pipe','inherit','inherit']});
   for(let i=0;i<n;i++){await p.evaluate(t=>draw(t),i/fps);const buf=await el.screenshot({type:'jpeg',quality:94});
     if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r)); if(i%60==0)console.log('frame',i,'/',n)}
   ff.stdin.end(); await new Promise(r=>ff.on('close',r));
 }
 await b.close();
})();
