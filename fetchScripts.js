const attach = () => document.getElementById(`fetchScripts`).addEventListener(`click`, processing);

const processing = async () => 
{
    // Get credentials
    const tenant = document.getElementById(`tenant`).value;
    const username = document.getElementById(`username`).value;
    const password = document.getElementById(`password`).value;
    const domain = document.getElementById(`domain`).value;
    const token = await fetchToken(tenant, username, encodeURIComponent(password), domain);

    // Get scripts
    const globalscripts = await fetchAllRecordsPaged(tenant, token, `api/script/v1/globalscripts`);
    const customactions = await fetchAllRecordsPaged(tenant, token, `api/script/v1/customactions`);
    const customcalculations = await fetchAllRecordsPaged(tenant, token, `api/script/v1/customcalculations`);
    const products = await fetchAllRecords(tenant, token, `setup/api/v1/admin/products`);
    const productscripts = [];
    const limit = 1000;
    let count = 0;
    for (p of products.pagedRecords)
    {
        const scr = await fetchAllRecordsPaged(tenant, token, `api/script/v1/products/${p.id}/scripts`);
        scr.forEach(s => s.productDefinition = p);
        productscripts.push(...scr);
        count++;
        if (count > limit) break;
    }
    const customresponsivetemplates = await fetchAllRecordsPaged(tenant, token, `/api/responsiveTemplate/v1/customResponsiveTemplates`);
    
    // Get events
    const events = [];
    const globalscriptsEvents = await fetchAllRecords(tenant, token, `api/script/v1/globalscripts/scripts/events`);
    const productscriptEvents = await fetchAllRecords(tenant, token, `api/script/v1/products/scripts/events`);
    events.push(...globalscriptsEvents, ...productscriptEvents);

    // Build objects for graph
    const result = [];
    result.push(...globalscripts.map((g) => processScript(`globalscript`, g, events)));
    result.push(...productscripts.map((g) => processScript(`productscript`, g, events, result)));
    result.push(...customactions.map((g) => processScript(`customaction`, g)));
    result.push(...customcalculations.map((g) => processScript(`customcalculation`, g)));
    result.push(...customresponsivetemplates.map((g) => processScript(`customresponsivetemplate`, g)));
    result.push(...events.map(ev => { return {
        id: "event_" + ev.id,
        file: ev.text, 
        imports: [], 
        description: ev.text.replace(/ /g, `_`), 
        type: `event`, 
        status: `active`, 
        products: []
    }; }));

    // Save zip
    var zip = new JSZip();
    var globalscriptsFolder = zip.folder(`globalscripts`);
    var customactionsFolder = zip.folder(`customactions`);
    var customcalculationsFolder = zip.folder(`customcalculations`);
    var productscriptsFolder = zip.folder(`productscripts`);
    var customresponsivetemplatesFolder = zip.folder(`customresponsivetemplates`);
    globalscripts.forEach(s => globalscriptsFolder.file(`${s.scriptDefinition.name}.ipy`, s.scriptDefinition.script));
    customactions.forEach(s => customactionsFolder.file(`${s.actionDefinition.name}.ipy`, s.actionDefinition.script));
    customcalculations.forEach(s => customcalculationsFolder.file(`${s.calculationDefinition.name}.ipy`, s.calculationDefinition.script));
    productscripts.forEach(s => productscriptsFolder.file(`${s.productScriptDefinition.name}.ipy`, s.productScriptDefinition.script));
    customresponsivetemplates.forEach(s => customresponsivetemplatesFolder.file(`${s.name}.html`, s.content));
    zip.generateAsync({type: `blob`}).then(c => saveBlob(c, `scripts_${domain}.zip`));

    // Save graph
    const template = await fetchFileContent(`template.html`);
    const bundle = await fetchFileContent(`code.js`);
    let graph = template;
    graph = graph.replace("__data__", JSON.stringify(result));
    graph = graph.replace("__events__", JSON.stringify(events));
    graph = graph.replace("__products__", JSON.stringify(products));
    graph = graph.replace("__title__", domain);
    graph = graph.replace("__bundle__", () => bundle);
    saveContent("text/html;charset=utf-8", encodeURIComponent(graph), `graph_${domain}.html`);

    // Save document
    const templateTable = await fetchFileContent(`templateTable.html`);
    let table = templateTable;
    table = table.replace("__data__", JSON.stringify(result));
    table = table.replace("__events__", JSON.stringify(events));
    // table = table.replace("__products__", JSON.stringify(products));
    table = table.replace("__title__", domain);
    // table = table.replace("__bundle__", () => bundle);
    saveContent("text/html;charset=utf-8", encodeURIComponent(table), `table_${domain}.html`);
};

const saveContent = (mimeType, content, filename) => {
    const hiddenElement = document.createElement(`a`);
    hiddenElement.href = `data:${mimeType},${content}`;
    hiddenElement.target = `_blank`;
    hiddenElement.download = filename;
    hiddenElement.click();
};

const saveBlob = (blob, fileName) => {
    const hiddenElement = document.createElement("a");
    document.body.appendChild(hiddenElement);
    hiddenElement.style = "display: none";  
    const url = window.URL.createObjectURL(blob);
    hiddenElement.href = url;
    hiddenElement.download = fileName;
    hiddenElement.click();
    window.URL.revokeObjectURL(url);
};

const fetchToken = async (tenant, username, password, domain) => 
{
    const tokenResponse = await fetch(`https://${tenant}.webcomcpq.com/basic/api/token`, {
        method: `POST`, // *GET, POST, PUT, DELETE, etc.
        mode: `cors`, // no-cors, *cors, same-origin
        body: `grant_type=password&username=${username}&password=${password}&domain=${domain}` 
    });
    return await tokenResponse.json();
};

const fetchAllRecords = async (tenant, token, endpoint) => 
{
    const url = `https://${tenant}.webcomcpq.com/${endpoint}`;
    const response = await fetch(url, {
        method: `GET`, // *GET, POST, PUT, DELETE, etc.
        mode: `cors`, // no-cors, *cors, same-origin
        cache: `no-cache`, // *default, no-cache, reload, force-cache, only-if-cached
        headers: {
            'Content-Type': `application/json`,
            'Authorization': `bearer ${token.access_token}`,
        }
    });
    return await response.json();
};

const fetchAllRecordsPaged = async (tenant, token, endpoint) => 
{
    const top = 100;
    const fetched = [];
    let nScripts;
    do 
    {
        const skip = fetched.length;
        const url = `https://${tenant}.webcomcpq.com/${endpoint}?$top=${top}&$skip=${skip}`;
        const response = await fetch(url, {
            method: `GET`, // *GET, POST, PUT, DELETE, etc.
            mode: `cors`, // no-cors, *cors, same-origin
            cache: `no-cache`, // *default, no-cache, reload, force-cache, only-if-cached
            headers: {
                'Content-Type': `application/json`,
                'Authorization': `bearer ${token.access_token}`,
            }
        });
        const records = await response.json();
        for (const r of records.pagedRecords) fetched.push(r);
        nScripts = records.totalNumberOfRecords;
    } while (fetched.length < nScripts)
    return fetched;
};

const fetchFileContent = async request => 
{
    response = await fetch(request);
    return response.text();
}

const processScript = (type, scriptObject, events, result) =>
{
    const importedModules = [];

    const typeMapping = {
        globalscript: `scriptDefinition`,
        customaction: `actionDefinition`,
        customcalculation: `calculationDefinition`,
        productscript: `productScriptDefinition`
    };
    const definition = type == `customresponsivetemplate` ? scriptObject : scriptObject[typeMapping[type]];
    const content = type == `customresponsivetemplate` ? definition.content : definition.script;

    if (type == `globalscript` || type == `productscript`)
    {
        try {
            const scriptEvents = scriptObject.events.map(e => events.filter(ev => ev.id == e.systemEventId)[0].text.replace(/ /g, "_"));
            importedModules.push(...scriptEvents);
        } catch (e) {}
    }

    if (type == `productscript` && scriptObject.isGlobal)
    {
        // actually a global script
        const globalScript = result.filter(r => r.id == scriptObject.id)[0];
        globalScript.products.push(scriptObject.product.id);
    }

    content.split(/\r?\n/).forEach(line =>
    {
        const regex1 = /^import ([^#]*)(?:#)?.*$/;
        const regex2 = /^from ([^# ]*) import?(?:#)?.*$/;
        const regex3 = /^[^#]*ScriptExecutor.Execute\(["'](.*)["']\)/;
        for (let regex of [regex1, regex2, regex3])
        {
            const result = line.match(regex);
            if (result && result.length > 1)
            {
                const modules = result[1].split(",").map(x=>x.trim()).map(x=>x.split(".")[0].trim());
                importedModules.push(...modules);
            }
        }
    });

    const description = definition.description ? definition.description : definition.name.replace(/ /g, "_");
    const fileName = definition.name.replace(/ /g, "_"); // remove spaces

    let status = `active`;
    if (type == `globalscript` || type == `productscript`)
        status = definition.active ? `active` : `inactive`;

    return {
        id: definition.id,
        file: fileName.includes("-") ? fileName.split("-")[1] : fileName,
        imports: Array.from(new Set(importedModules)),
        description: description ? description.trim() : "",
        type: type,
        status: status,
        products: scriptObject.productDefinition ? [scriptObject.productDefinition.id] : []
    };
};

document.addEventListener("DOMContentLoaded", attach);