import {test} from "node:test";
import assert from "node:assert/strict";
import {createCivitaiBrowser} from "./civitai-browser.mjs";
test("catalog constrains providers, uses cursor pagination and filters versions",async()=>{
  let requested;
  const catalog=createCivitaiBrowser({json:async(url)=>{requested=new URL(url);return {items:[{id:1,name:"Style",type:"LORA",modelVersions:[{id:12,name:"IL",baseModel:"Illustrious",images:[{url:"https://image.civitai.com/preview.jpeg",nsfwLevel:1}]},{id:13,name:"Pony",baseModel:"Pony"}]},{id:2,nsfw:true,modelVersions:[{id:20}]}],metadata:{nextCursor:"next|20"}};}});
  const page=await catalog.search({host:"civitai.red",query:"style",type:"LORA",baseModels:"Illustrious",cursor:"first|1"});
  assert.equal(requested.host,"civitai.red");assert.equal(requested.searchParams.get("cursor"),"first|1");assert.equal(requested.searchParams.has("page"),false);
  assert.equal(page.items.length,1);assert.equal(page.items[0].versions.length,1);
  assert.match(page.items[0].versions[0].url,/civitai.red\/models\/1\?modelVersionId=12$/);
  assert.match(page.items[0].preview,/^\/bridge\/civitai\/image\?id=/);assert.equal(page.cursor,"next|20");
  await assert.rejects(catalog.search({host:"localhost"}),{status:400});
  await assert.rejects(catalog.search({cursor:"x".repeat(513)}),{status:400});
  await assert.rejects(catalog.image("https://localhost/secret"),{status:404});
});
test("catalog never exposes arbitrary image URLs and recovers after a provider failure",async()=>{
  let count=0;
  const catalog=createCivitaiBrowser({json:async()=>{if(!count++)throw Error("provider unavailable");return {items:[{id:1,name:"A",modelVersions:[{id:2,images:[{url:"https://localhost/private"}]}]}],metadata:{nextPage:"https://attacker.test/?cursor=bad"}};}});
  await assert.rejects(catalog.search());const result=await catalog.search();assert.equal(result.items[0].preview,"");assert.equal(result.cursor,null);
});
