// Get script chains
const processImports = (scriptName, dataFiltered) => 
{    
    let importList = [];
    let stack = [];
    stack.push([scriptName]);
    while (stack.length > 0)
    {
        const currentScriptChain = stack.pop();
        const currentScriptValue = currentScriptChain[currentScriptChain.length - 1];
        const scriptObject = dataFiltered.filter(x => x.file == currentScriptValue)[0];
        if (!scriptObject) continue;

        if (_.some(scriptObject.imports, x => dataFiltered.map(f=>f.file).includes(x)))
        {
            for (let scriptImport of scriptObject.imports)
                if (!currentScriptChain.includes(scriptImport))
                    stack.push([...currentScriptChain, scriptImport]);
        }
        else 
        {
            importList.push(currentScriptChain);
        }
    }
    return importList;
}

// Helper function to retrieve node that has already been added to the "force directed network"
const findByName = (o, name) => 
{
    const found = o.children.filter(x => x.name == name);
    if (found.length > 0) return found[0];
    for (child of o.children) {
        const foundDeep = findByName(child, name);
        if (foundDeep != -1)
            return foundDeep;
    }
    return -1;
}

// Build data for chart
const buildChartAndRender = () => 
{
    const colors = {
        black: `#000`,
        blue: `#007bff`,
        indigo: `#6610f2`,
        purple: `#6f42c1`,
        pink: `#e83e8c`,
        red: `#dc3545`,
        orange: `#fd7e14`,
        yellow: `#ffc107`,
        green: `#28a745`,
        teal: `#20c997`,
        cyan: `#17a2b8`,
        white: `#fff`,
        gray: `#6c757d`
    };
    const colorMapping = {
        globalscript: colors.blue,
        customaction: colors.red,
        customcalculation: colors.green,
        productscript: colors.yellow,
        customresponsivetemplate: colors.orange,
        event: colors.black
    };

    let dataFiltered = data;
    for (let filter of window.activeFilters) 
    {
        dataFiltered = dataFiltered.filter(d => d.type != filter);
    }

    // filter
    // const filters = ["/globalscript/", "/customaction/", "/calculation/", "/inactive/", "/module/", "/productscript/"];
    // const filterPositive = filters
    //     .filter(f => window.activeFilters.includes(f))
    //     .map(f => d => d.includes(f));
    // const filterNegative = filters
    //     .filter(f => !window.activeFilters.includes(f))
    //     .map(f => d => !d.includes(f));
    // const fileHierarchyFiltered = fileHierarchy.filter(file => 
    //     _.some(filterPositive, f => f(file["directory"])) &&
    //     _.every(filterNegative, f => f(file["directory"]))
    // );

    // Can use map if there are no multiple imports:
    // ---------------------------------------------
    // file1 imports file2
    // file2 imports file3 # -- not imported file4
    // file3
    // =>
    // file1 imports file2 imports file3
    // file2 imports file3
    // file3

    // Cannot use map with multiple imports
    // ------------------------------------
    // file1 imports file2
    // file2 imports file3, file4
    // file3
    // file4
    // =>
    // file1 imports file2 imports file3
    // file1 imports file2 imports file4
    // file2 imports file3
    // file3 imports file4
    // file3
    // file4

    // Still use map solution:
    // -----------------------
    // file1 imports file2
    // file2 imports file3, file4
    // file3
    // file4
    // =>
    // [file1 imports file2 imports file3, file1 imports file2 imports file4]
    // [file2 imports file3, file3 imports file4]
    // [file3]
    // [file4]

    // Change format of hierarchy to work with chart visualization (intermediate step)
    const temp = dataFiltered.map(x => processImports(x.file, dataFiltered));

    // Flatten imports
    let flattenedScriptChain = _.uniqBy(_.flatten(temp), JSON.stringify);

    // Process in groups of import sequence length going down to one:
    // --------------------------------------------------------------
    // file1 imports file2 imports file3    # group 1 (length 3)
    // file1 imports file2 imports file4    # group 1 (length 3)
    // file2 imports file3                  # group 2 (length 2)
    // file3 imports file4                  # group 2 (length 2)
    // file3                                # group 3 (length 1)
    // file4                                # group 3 (length 1)

    // Fully prepare data format for chart visualization (final step)
    const visualizationStructure = [{ children: [], linkWith: [] }];
    const alreadyAdded = [];
    const maxLength = flattenedScriptChain.reduce((x, y) => Math.max(x, y.length), 0); // get maximum length of sublists
    for (let i = maxLength; i > 0; i--)
    {
        const sublists = flattenedScriptChain.filter(x => x.length == i); // get sublists of length i
        for (let list of sublists)
        {
            let parentNode = visualizationStructure[0];
            for (let n = list.length - 1; n > -1; n--)
            {
                const node = list[n];
                if (alreadyAdded.includes(node))
                {
                    parentNode.linkWith.push(node);
                    parentNode = findByName(visualizationStructure[0], node);
                }
                else
                {
                    const info = dataFiltered.filter(x=>x.file == node)[0];
                    const newLength = parentNode.children.push(
                    { 
                        name: node,
                        description: info.description && info.description != node ? `${node}\n\n${info.description}` : node,
                        color: info.status == `active` ? colorMapping[info.type] : colors.gray,
                        children: [],
                        linkWith: [],
                        value: n
                    });
                    parentNode = parentNode.children[newLength - 1];
                    alreadyAdded.push(node);
                }
            }
        }
    }

    // Use in chart
    am4core.ready(() => render(visualizationStructure[0].children));
}

// Render chart
const render = (data) => {

    // Themes begin
    am4core.useTheme(am4themes_animated);
    // Themes end

    window.chart = am4core.create("chartdiv", am4plugins_forceDirected.ForceDirectedTree);

    var networkSeries = chart.series.push(new am4plugins_forceDirected.ForceDirectedSeries())
    networkSeries.dataFields.linkWith = "linkWith";
    networkSeries.dataFields.name = "name";
    networkSeries.dataFields.id = "name";
    networkSeries.dataFields.value = "value";
    networkSeries.dataFields.children = "children";
    networkSeries.dataFields.color = "color";

    networkSeries.maxRadius = parseInt(window.maxRadius);
    networkSeries.minRadius = parseInt(window.minRadius);

    networkSeries.nodes.template.label.text = "{name}"
    networkSeries.fontSize = 9;
    networkSeries.linkWithStrength = 0;

    var nodeTemplate = networkSeries.nodes.template;
    nodeTemplate.tooltipText = "{description}";
    nodeTemplate.fillOpacity = 1;
    nodeTemplate.label.hideOversized = true;
    nodeTemplate.label.truncate = true;

    var linkTemplate = networkSeries.links.template;
    linkTemplate.strokeWidth = 1;
    var linkHoverState = linkTemplate.states.create("hover");
    linkHoverState.properties.strokeOpacity = 1;
    linkHoverState.properties.strokeWidth = 2;

    nodeTemplate.events.on("over", function (event) {
      var dataItem = event.target.dataItem;
      dataItem.childLinks.each(function (link) {
        link.isHover = true;
      })
    })

    nodeTemplate.events.on("out", function (event) {
      var dataItem = event.target.dataItem;
      dataItem.childLinks.each(function (link) {
        link.isHover = false;
      })
    })

    document.getElementById("clusterCount").innerText = data.length;

    let countRecursive = (node) => node.children.length + _.sum(node.children.map(countRecursive));

    document.getElementById("nodeCount").innerText = data.length + _.sum(data.map(countRecursive));
    networkSeries.data = data;
}

// Wait until page ready
$(document).ready(() => 
{
    // Start building chart
    window.maxRadius = 100;
    window.minRadius = 5;
    window.activeFilters = [...document.querySelectorAll("#filtermenu input:not(:checked)")].map(checkbox => checkbox.value);
    buildChartAndRender();

    // Attach events
    $("#filtermenu input[type='checkbox']").change(function()
    {
        window.activeFilters = [...document.querySelectorAll("#filtermenu input:not(:checked)")].map(checkbox => checkbox.value)
        window.chart.dispose();
        buildChartAndRender();
    });

    document.getElementById("myRange").oninput = function() 
    {
        window.minRadius = this.value;
        window.chart.dispose();
        buildChartAndRender();
    }

    document.getElementById("myRange2").oninput = function() 
    {
        window.maxRadius = this.value;
        window.chart.dispose();
        buildChartAndRender();
    }
});

