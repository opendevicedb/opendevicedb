import {test,expect}from"@playwright/test";
import AxeBuilder from"@axe-core/playwright";
import{createHash}from"node:crypto";
test("browser capture exposes three modules, local resources and no native bridge field",async({page})=>{
 await page.goto("/components/");await page.locator('[data-open-application="ultrasound/convex-capture"]').click();const d=page.getByRole("dialog");
 await expect(d.getByRole("heading",{name:"Ultrasound live capture",exact:true})).toBeVisible();
 await expect(d.getByRole("button",{name:"Start capture",exact:true})).toBeDisabled();
 await expect(d.getByLabel("Local preview bridge URL")).toBeHidden();
 await expect(d.getByLabel("Probe resources (.odb-probe)")).toBeVisible();
 await d.getByRole("button",{name:"Customize",exact:true}).click();await expect(d.locator(".app-block")).toHaveCount(3);
 await d.getByRole("spinbutton",{name:"source seconds",exact:true}).fill("2");await expect(d.getByLabel("Capture duration (seconds)",{exact:true})).toHaveValue("2");
 await d.getByLabel("Capture duration (seconds)",{exact:true}).fill("1");await expect(d.getByRole("spinbutton",{name:"source seconds",exact:true})).toHaveValue("1");
 const audit=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(audit.violations.map(v=>v.id)).toEqual([]);
 expect(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test("incomplete resources fail in the actual WASM before any USB interface is opened",async({page})=>{
 await page.addInitScript(()=>{let opens=0;const usb=new EventTarget()as any;usb.requestDevice=async()=>({vendorId:0x04b4,productId:0x4611,open:async()=>{opens++;}});Object.defineProperty(navigator,"usb",{value:usb});(window as any).openedProbe=()=>opens;});
 await page.goto("/components/");await page.locator('[data-open-application="ultrasound/convex-capture"]').click();const d=page.getByRole("dialog");
 const empty=createHash("sha256").update("").digest("hex");
 const bundle={format:"odb-probe-resources/1",profile:"convex-01",configuration:{},files:{"assets/A_Probe.bin":{base64:"",sha256:empty}}};
 await d.getByLabel("Probe resources (.odb-probe)").setInputFiles({name:"synthetic-incomplete.odb-probe",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(bundle))});
 await d.getByRole("checkbox").check();await d.getByRole("button",{name:"Start capture",exact:true}).click();
 await expect(d.locator(".app-status")).toContainText(/Require settings object|Require exact convex pipeline keys/);
 expect(await page.evaluate(()=>(window as any).openedProbe())).toBe(0);await expect(d.locator("iframe")).toHaveCount(0);
});
