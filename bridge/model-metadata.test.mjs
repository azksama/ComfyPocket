import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,stat,utimes} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createModelMetadata} from "./model-metadata.mjs";
test("sidecars override header metadata, accept BOM and invalidate cache",async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),"mochi-metadata-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const info=createModelMetadata({roots:[{path:dir}],modelPaths:{loras:[dir]}});
  const file=path.join(dir,"style.cm-info.json");
  await writeFile(file,'\ufeff'+JSON.stringify({BaseModel:"Illustrious"}));assert.equal((await info("loras","style.safetensors")).baseModel,"Illustrious");
  const before=await stat(file);await writeFile(file,JSON.stringify({BaseModel:"Pony"}));await utimes(file,before.atime,new Date(before.mtimeMs+2000));
  assert.equal((await info("loras","style.safetensors")).baseModel,"Pony");
  assert.equal((await info("loras","unknown.safetensors")).baseModel,"");
  await assert.rejects(info("loras","../outside.safetensors"),{status:403});
});
