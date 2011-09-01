/*
 * Copyright (C) Camptocamp
 *
 * This file is part of geOrchestra
 *
 * geOrchestra is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with geOrchestra.  If not, see <http://www.gnu.org/licenses/>.
 */


/*
 * @requires GeoExt/data/LayerRecord.js
 * @include OpenLayers/Request.js
 * @include OpenLayers/Format/CSWGetDomain/v2_0_2.js
 * @include OpenLayers/Format/CSWGetRecords/v2_0_2.js
 * @include OpenLayers/Filter/Comparison.js
 * @include Ext.ux/widgets/tree/TreeStoreNode.js
 * @include Ext.ux/widgets/tree/XmlTreeLoader.js
 * @include GEOR_util.js
 * @include GEOR_config.js
 */

Ext.namespace("GEOR");

GEOR.cswbrowser = (function() {

    /*
     * Private
     */
    
    var observable = new Ext.util.Observable();
    observable.addEvents(
        /**
         * Event: selectionchanged
         * Fires when the selection has changed
         *
         * Listener arguments:
         * records - {Array} array of selected records
         */
        "selectionchanged"
    );
    
    var addButton = null;

    /**
     * Property: mask
     * {Ext.LoadMask} the catalogue's keywords panel mask
     */
    var mask = null;

    /**
     * Property: xmlTreeLoader
     * {Ext.ux.tree.XmlTreeLoader} the treeLoader
     */
    var xmlTreeLoader = null;

    /**
     * Property: treeSorter
     * {Ext.tree.TreeSorter} the tree sorter
     */
    var treeSorter = null;
    
    /**
     * Property: tree
     * {Ext.tree.TreePanel} the tree panel
     */
    var tree;

    /**
     * Method: filterCswRecord
     * Keep only WMS-1.1.1 records with a correct layer name and server URL
     *
     * Parameters:
     * records - {Array} array of records
     *
     * Returns:
     * {Array} array of filtered records
     */
    var filterCswRecord = function(records) {
        var filtered = [], name, rights = [], metadataURL;
        Ext.each(records, function (record) {
            if(record.URI) {
                // multiple wms can be found in one csw:Record
                Ext.each(record.URI, function (item) {
                    if((item.protocol == "OGC:WMS-1.1.1-http-get-map") &&
                        item.name && item.value) {

                        name = (record.title && record.title[0]) ?
                                record.title[0].value : "undefined";

                        metadataURL = null;
                        if (record.identifier && record.identifier[0]) {
                            metadataURL = GEOR.config.GEONETWORK_URL+
                                '/metadata.show?uuid='+ record.identifier[0].value;
                            name += ' - <a href="'+metadataURL +
                                '" target="_blank" onclick="window.open(this.href);return false;">métadonnées</a>';
                        }

                        if (record.rights && record.rights[0]) {
                            Ext.each(record.rights, function(r) {
                                rights.push(r.value);
                            });
                        }
                        this.push({
                            name: name,
                            layername: item.name,
                            wmsurl: item.value,
                            metadataURL: metadataURL,
                            rights: rights.join(' - ') || "",
                            abstract: record.abstract ?
                                record.abstract[0] : "",
                            source: (record.source && record.source[0]) ?
                                record.source[0].value : ""
                        });
                    }
                }, this);
            }
        }, filtered);
        return filtered;
    };

    /**
     * Method: cleanTree
     * Removes all children nodes of a given tree
     *
     * Parameters:
     * tree - {Ext.tree.TreePanel} the treePanel to empty
     */
    var cleanTree = function(tree) {
        while (tree.root.item(0)) {
            tree.root.item(0).remove();
        }
    };

    /**
     * Method: appendKeyword
     * Create and append treenode to tree with given keyword
     *
     * Parameters:
     * tree - {Ext.tree.TreePanel} the treePanel to append the node to
     * keyword - {String} the keyword string to display
     */
    var appendKeyword = function(tree, keyword) {
        if (!xmlTreeLoader) {
            xmlTreeLoader = new Ext.ux.tree.XmlTreeLoader({
                url: GEOR.config.CSW_URL,
                parseInput: function(treeLoader, treeNode) {
                    var getRecordsFormat = new OpenLayers.Format.CSWGetRecords({
                        maxRecords: 100
                    });
                    return getRecordsFormat.write({
                        resultType: "results",
                        Query: {
                            Constraint: {
                                version: "1.1.0",
                                Filter: new OpenLayers.Filter.Comparison({
                                    type: OpenLayers.Filter.Comparison.EQUAL_TO,
                                    property: GEOR.config.CSW_GETDOMAIN_PROPERTY,
                                    value: treeNode.text
                                })
                            },
                            // adding sort info:
                            // see http://csm-bretagne.fr/redmine/issues/1724
                            SortBy: [{
                                "property": 'Title',
                                "order": "DESC"
                            }],
                            ElementSetName: {
                                value: "full"
                            }
                        }
                    });
                },
                parseOutput: function(treeLoader, xml) {
                    var getRecordsFormat = new OpenLayers.Format.CSWGetRecords();
                    var response = getRecordsFormat.read(xml);
                    var filteredRecords = filterCswRecord(response.records);
                    return filteredRecords;
                }
            });
        }

        tree.root.appendChild(new Ext.ux.tree.TreeStoreNode({
            text: keyword,
            store: new Ext.data.JsonStore({
                fields: [
                    {name: 'text', mapping: 'name'},
                    {name: 'name', mapping: 'layername'},
                    {name: 'description', mapping: 'abstract'},
                    {name: 'wmsurl'},
                    {name: 'metadataURL'},
                    {name: 'rights'},
                    {name: 'qtip', mapping: 'abstract'},
                    {name: 'displayInTree', defaultValue: true}
                ]
            }),
            expandable: true,
            expanded: false,
            loader: xmlTreeLoader,
            leaf: false,
            defaults: {
                checked: false
            }
        }));

        if (!treeSorter && GEOR.config.CSW_GETDOMAIN_SORTING) {
            treeSorter = new Ext.tree.TreeSorter(tree, {
                folderSort: false,
                caseSensitive: false,
                dir: "asc",
                sortType: function(node) {
                    var translate = {
                        "ä": "a", "á": "a", "à": "a", "â": "a",
                        "Ä": "A", "Á": "A", "À": "A", "Â": "A",
                        "ë": "e", "é": "e", "è": "e", "ê": "e",
                        "Ë": "E", "É": "E", "È": "E", "Ê": "E",
                        "ï": "i", "î": "i",
                        "Ï": "I", "Î": "I",
                        "ö": "o", "ó": "o", "ò": "o", "ô": "o",
                        "Ö": "O", "Ó": "O", "Ò": "O", "Ô": "O",
                        "ü": "u", "ú": "u", "ù": "u", "û": "u",
                        "Ü": "U", "Ú": "U", "Ù": "U", "Û": "U"
                    };
                    var translate_re = /[äáàâÄÁÀÂëéèêËÉÈÊïîÏÎöóòôÖÓÒÔüúùûÜÚÙÛ]/g;

                    var text = (node.text) ? node.text.replace(translate_re, function(match) {
                        return translate[match];
                    }) : "";
                    return text.toLowerCase();
                }
            });
        }
    };

    /**
     * Method: buildGeorTree
     * Creates geOrchestra keyword list in tree
     *
     * Parameters:
     * tree - {Ext.tree.TreePanel} the treePanel to append the nodes to
     */
    var buildGeorTree = function(tree) {
        mask && mask.show();
        cleanTree(tree);
        var getDomainFormat = new OpenLayers.Format.CSWGetDomain();
        OpenLayers.Request.POST({
            url: GEOR.config.CSW_URL,
            data: getDomainFormat.write({
                PropertyName: GEOR.config.CSW_GETDOMAIN_PROPERTY
            }),
            success: function(response) {
                var r = getDomainFormat.read(response.responseText);
                Ext.each(r.DomainValues[0].ListOfValues, function (item) {
                    appendKeyword(tree, item.Value.value);
                }, this);
                mask && mask.hide();
            },
            failure: function() {
                mask && mask.hide();
                GEOR.util.errorDialog({
                    msg: "La requête CSW getDomain a échoué"
                });
            }
        });
    };

    /**
     * Method: buildInspireTree
     * Creates Inspire keyword list in tree
     *
     * Parameters:
     * tree - {Ext.tree.TreePanel} the treePanel to append the nodes to
     */
    var buildInspireTree = function(tree, key) {
        mask && mask.show();
        cleanTree(tree);
        if (!key) {
            GEOR.util.errorDialog({
                title: "Erreur sur le thésaurus",
                msg: "Absence de clé pour accéder à ce thésaurus"
            });
        }
        OpenLayers.Request.GET({
            url: GEOR.config.GEONETWORK_URL + '/xml.search.keywords',
            params: {
                pNewSearch: 'true',
                pKeyword: '*',
                //maxResults: '100', // Should it be changed ?
                pTypeSearch: 1,
                // pTypeSearch: 0 = starts with / 1 = contains / 2 = exact match
                pMode: 'consult',
                pThesauri: key
            },
            success: function(response) {
                var keywordType = Ext.data.Record.create([
                    {name: 'selected', mapping: 'selected'},
                    {name: 'name', mapping: 'value'},
                    {name: 'description', mapping: 'definition'},
                    {name: 'uri', mapping: 'uri'}
                ]);
                var myReader = new Ext.data.XmlReader({
                   record: "keyword",
                   id: "id"
                }, keywordType);
                var r = myReader.read(response);
                if (r.records) {
                    Ext.each(r.records, function(record) {
                        appendKeyword(tree, record.get('name'));
                    });
                }
                mask && mask.hide();
            },
            failure: function() {
                mask && mask.hide();
                GEOR.util.errorDialog({
                    msg: "La requête des mots clés a échoué"
                });
            }
        });
    };

    /*
     * Public
     */
    return {
        /*
         * Observable object
         */
        events: observable,
        
        /**
         * APIMethod: getPanel
         * Return the panel for the CSW browser tab.
         *
         * Returns:
         * {Ext.Panel}
         */
        getPanel: function() {

            tree = new Ext.tree.TreePanel({
                region: 'center',
                useArrows:true,
                autoScroll:true,
                animate:true,
                rootVisible: false,
                border: false,
                root: {
                    nodeType: 'async'
                }
            });
            var registerCheckbox = function(node){
                if(!node.hasListener("checkchange")) {
                    node.on("checkchange", function(node, checked) {
                        observable.fireEvent("selectionchanged", 
                            tree.getChecked('record'));
                    });
                }
            };
            tree.on({
                "insert": registerCheckbox,
                "append": registerCheckbox
            });

            var recordType = Ext.data.Record.create([
                {name: 'name', type: 'string', mapping: 'filename'},
                {name: 'key', type: 'string', mapping: 'key'}
            ]);
            var thesauriStore = new Ext.data.Store({
                autoLoad: true,
                proxy: new Ext.data.HttpProxy({
                    url: GEOR.config.GEONETWORK_URL + '/xml.thesaurus.getList',
                    method: 'GET',
                    disableCaching: false
                }),
                reader: new Ext.data.XmlReader({
                    record: 'thesaurus',
                    id: 'key'
                }, recordType),
                listeners: {
                    "load": function(store) {
                        var regexp = new RegExp('.rdf');
                        store.each(function(r) {
                            r.set('name', r.get('name').replace(regexp, ''));
                        });
                        // adding record GEOR.config.THESAURUS_NAME
                        var v = [];
                        v['name'] = GEOR.config.THESAURUS_NAME;
                        v['key'] = GEOR.config.THESAURUS_NAME;
                        store.add([new recordType(v)]);

                        var defKey = GEOR.config.DEFAULT_THESAURUS_KEY;
                        combo.setValue(defKey);
                        var r = store.query('key', defKey).first();
                        combo.fireEvent('select', combo, r);
                    },
                    scope: this
                }
            });

            var combo = new Ext.form.ComboBox({
                xtype: 'combo',
                id: 'mycombo',
                fieldLabel: 'Nomenclature',
                store: thesauriStore,
                loadingText: 'chargement...',
                mode: 'local',
                triggerAction: 'all',
                editable: false,
                valueField: 'key',
                displayField: 'name',
                listeners: {
                    "select": function(combo, record) {
                        if (record.get('key') == GEOR.config.THESAURUS_NAME) {
                            buildGeorTree(tree);
                        } else {
                            buildInspireTree(tree, record.get('key'));
                        }
                    }
                }
            });

            return new Ext.Panel({
                title: GEOR.config.CATALOG_NAME,
                layout: 'border',
                items: [{
                    region: 'north',
                    xtype: 'form',
                    border: false,
                    height: 35,
                    bodyStyle: 'padding: 5px;',
                    items: [combo]
                }, tree],
                listeners: {
                    "afterlayout": function() {
                        if (!mask) {
                            mask = new Ext.LoadMask(tree.getEl(), {
                                msg: "chargement en cours"
                            });
                        }
                    }
                }
            });
        },
        
        /**
         * APIMethod: clearSelection
         * Clears the tree panel selection
         */
        clearSelection: function() {
            Ext.each(tree.getChecked(), function (item) {
                item.getUI().toggleCheck(false);
            });
        }
    };
})();