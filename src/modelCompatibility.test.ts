import {describe,it,expect} from "vitest";
import {compatibleModel,modelFamily} from "./modelCompatibility";
describe("declared LoRA compatibility",()=>{
  it("recognizes aliases without conflating SDXL fine-tunes",()=>{
    expect(compatibleModel("Illustrious","Illustrious XL")).toBe(true);
    for(const other of ["Pony","SDXL 1.0","Flux.1 D","NoobAI",""]) expect(compatibleModel("Illustrious",other)).toBe(false);
    expect(compatibleModel("SD 1.5","stable-diffusion-v1/lora")).toBe(true);
    expect(compatibleModel("","")).toBe(false);
    expect(modelFamily("FLUX.1 D")).not.toBe(modelFamily("Flux.1 S"));
  });
});
