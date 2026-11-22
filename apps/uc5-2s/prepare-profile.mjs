// Prepare the private General profile for the optional offline snapshot export; the HTML never loads this file.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [source,output]=process.argv.slice(2);
const bytes=readFileSync(source);
if(createHash('sha256').update(bytes).digest('hex')!=='d06adade7c4b084d335b5aaeb20806e49e8e1cc2f6736477c42e371e2551caae')throw Error('Unexpected General resource bundle');
const resources=Object.fromEntries(Object.entries(JSON.parse(bytes).files).map(([key,file])=>[key,[...Buffer.from(file.base64,'base64')]]));
delete resources["hv/0.coe"]; // The decoder already embeds this bank.
writeFileSync(output,JSON.stringify(resources),{mode:0o600});
