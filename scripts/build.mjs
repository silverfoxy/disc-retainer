import {copyFile,mkdir,rm,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),output=new URL('.public/',root);
// Explicit browser assets only: source experiments, notebooks, and local
// microphone/Python services must never be exposed by the public website.
const assets=['index.html','style.css','app.mjs','scene3d.mjs','model.mjs','protocol.mjs','voice-commands.mjs','local-speech.mjs','speech-capture.mjs'];
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await Promise.all(assets.map(file=>copyFile(new URL(file,root),new URL(file,output))));
await writeFile(new URL('_headers',output),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  Permissions-Policy: microphone=(self), camera=()
  Cache-Control: public, max-age=0, must-revalidate
`);
console.log(`Built ${assets.length} browser assets in .public/`);
