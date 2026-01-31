import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      header: {
        subtitle: "Layer Management System"
      },
      common: {
        import: "Import",
        new: "New",
        cancel: "Cancel",
        save: "Save",
        create: "Create",
        delete: "Delete",
        finish: "Finish",
        add: "Add",
        edit: "Edit",
        yes: "Yes",
        no: "No",
        back: "Back"
      },
      layers: {
        title: "LAYERS",
        entities: "entities", // used in badge: "2 entities"
        table_btn: "Table",
        legend: "Legend",
        export_geojson: "Export GeoJSON",
        upload_btn: "Import", // Button inside layer manager
        new_layer_btn: "New"  // Button inside layer manager
      },
      modals: {
        settings_title: "Layer Settings",
        new_layer_title: "New Layer",
        layer_name: "Layer Name",
        geometry_type: "Geometry Type",
        vis_type_single: "Single Color",
        vis_type_unique: "Unique Values (Column)",
        color: "Layer Color",
        select_column: "Select Column",
        choose_column: "Choose Column for Coloring",
        size_px: "Width / Size (px)",
        extrusion: "Extrusion (3D Volume)",
        save_changes: "Save Changes",
        comment_warning: "Styling is locked for comments. These are displayed as an exclamation mark (!) by default."
      },
      map_tools: {
        pos_mode: "POSITION EDIT MODE",
        pos_desc: "Click on map to move the element.",
        vertex_mode: "VERTEX EDIT MODE",
        vertex_desc_select: "Select a white point (vertex) to move it.",
        vertex_desc_move: "Move the point and click to fix it.",
        snap_on: "Snap (Active)",
        snap_off: "Snap",
        active_layer: "Active Layer:",
        add_feature: "Add {{type}}", // e.g. Add POLYGON
        cancel_draw: "Cancel Drawing"
      },
      table: {
        title: "Attributes:",
        manage_cols: "Manage Columns",
        add_col_title: "Add New Column",
        col_name_placeholder: "Column name",
        add_btn: "Add",
        existing_cols: "Existing Columns:",
        no_cols: "No columns defined.",
        headers: {
          id: "ID",
          name: "Name",
          actions: "Actions"
        },
        empty_cell: "empty"
      },
      editor: {
        new_entity: "New Entity",
        edit_entity: "Edit #{{id}}",
        layer_label: "Layer: {{name}}",
        geometry_section: "Geometry",
        coord_x: "X (Lon)",
        coord_y: "Y (Lat)",
        coord_z: "Z (Altitude)",
        btn_move_vertex: "Edit Position (Vertex)", // For POINT
        btn_move_geo: "Move geometry on map",    // For others
        btn_edit_vertices: "Edit Vertices",
        extrusion_label: "Extrusion (Height)",
        unit_meters: "m",
        attributes_section: "Attributes (Table)",
        name_label: "Name"
      },
      alerts: {
        confirm_delete_layer: "Are you sure you want to delete this layer?",
        delete_col_restricted: "You cannot delete the extrusion column.",
        confirm_delete_col: "Delete column \"{{colName}}\"?",
        confirm_delete_feature: "Delete this element?",
        too_few_points: "Too few points!",
        col_exists: "Column already exists!",
        import_success: "Success! {{count}} elements were imported into layer \"{{layerName}}\".",
        import_error: "Import error: {{message}}",
        format_error: "Invalid format: 'features' array is missing.",
        no_geo_error: "No valid geometries found.",
        type_error: "Geometry type {{type}} is not supported.",
        layer_create_error: "Layer could not be created.",
        db_layer_error: "DB Layer error: {{message}}",
        db_feature_error: "DB Features error: {{message}}",
        coords_error: "Could not process coordinates from file."
      }
    }
  },
  de: {
    translation: {
      header: {
        subtitle: "Ebenenverwaltungssystem"
      },
      common: {
        import: "Importieren",
        new: "Neu",
        cancel: "Abbrechen",
        save: "Speichern",
        create: "Erstellen",
        delete: "Löschen",
        finish: "Beenden",
        add: "Hinzufügen",
        edit: "Bearbeiten",
        yes: "Ja",
        no: "Nein",
        back: "Zurück"
      },
      layers: {
        title: "EBENEN",
        entities: "Entitäten",
        table_btn: "Tabelle",
        legend: "Legende",
        export_geojson: "GeoJSON exportieren",
        upload_btn: "Import",
        new_layer_btn: "Neu"
      },
      modals: {
        settings_title: "Ebeneneinstellungen",
        new_layer_title: "Neue Ebene",
        layer_name: "Ebenenname",
        geometry_type: "Geometrietyp",
        vis_type_single: "Einzelfarbe",
        vis_type_unique: "Eindeutige Werte (Spalte)",
        color: "Ebenenfarbe",
        select_column: "Spalte auswählen",
        choose_column: "Spalte für Färbung wählen",
        size_px: "Breite / Größe (px)",
        extrusion: "Extrusion (3D-Volumen)",
        save_changes: "Änderungen speichern",
        comment_warning: "Das Styling ist für Kommentare gesperrt. Diese werden standardmäßig als Ausrufezeichen (!) angezeigt."
      },
      map_tools: {
        pos_mode: "POSITIONS-BEARBEITUNGSMODUS",
        pos_desc: "Klicken Sie auf die Karte, um das Element zu verschieben.",
        vertex_mode: "VERTEX-BEARBEITUNGSMODUS",
        vertex_desc_select: "Wählen Sie einen weißen Punkt (Vertex), um ihn zu verschieben.",
        vertex_desc_move: "Bewegen Sie den Punkt und klicken Sie, um ihn zu fixieren.",
        snap_on: "Einrasten (Aktiv)",
        snap_off: "Einrasten",
        active_layer: "Aktive Ebene:",
        add_feature: "{{type}} hinzufügen",
        cancel_draw: "Zeichnen abbrechen"
      },
      table: {
        title: "Attribute:",
        manage_cols: "Spalten verwalten",
        add_col_title: "Neue Spalte hinzufügen",
        col_name_placeholder: "Spaltenname",
        add_btn: "Add",
        existing_cols: "Vorhandene Spalten:",
        no_cols: "Keine Spalten definiert.",
        headers: {
          id: "ID",
          name: "Name",
          actions: "Aktionen"
        },
        empty_cell: "leer"
      },
      editor: {
        new_entity: "Neue Entität",
        edit_entity: "Bearbeitung #{{id}}",
        layer_label: "Ebene: {{name}}",
        geometry_section: "Geometrie",
        coord_x: "X (Lon)",
        coord_y: "Y (Lat)",
        coord_z: "Z (Höhe)",
        btn_move_vertex: "Position bearbeiten (Vertex)",
        btn_move_geo: "Geometrie auf Karte verschieben",
        btn_edit_vertices: "Vertices bearbeiten",
        extrusion_label: "Extrusion (Höhe)",
        unit_meters: "m",
        attributes_section: "Attribute (Tabelle)",
        name_label: "Bezeichnung"
      },
      alerts: {
        confirm_delete_layer: "Möchten Sie diese Ebene wirklich löschen?",
        delete_col_restricted: "Die Extrusionsspalte kann nicht gelöscht werden.",
        confirm_delete_col: "Spalte \"{{colName}}\" löschen?",
        confirm_delete_feature: "Dieses Element löschen?",
        too_few_points: "Zu wenige Punkte!",
        col_exists: "Spalte existiert bereits!",
        import_success: "Erfolg! {{count}} Elemente wurden in Ebene \"{{layerName}}\" importiert.",
        import_error: "Importfehler: {{message}}",
        format_error: "Ungültiges Format: 'features' Array fehlt.",
        no_geo_error: "Keine gültigen Geometrien gefunden.",
        type_error: "Geometrietyp {{type}} wird nicht unterstützt.",
        layer_create_error: "Ebene konnte nicht erstellt werden.",
        db_layer_error: "DB Ebenenfehler: {{message}}",
        db_feature_error: "DB Feature-Fehler: {{message}}",
        coords_error: "Koordinaten aus der Datei konnten nicht verarbeitet werden."
      }
    }
  },
  ro: {
    translation: {
      header: {
        subtitle: "Layer Management System"
      },
      common: {
        import: "Import",
        new: "Nou",
        cancel: "Renunță", // sau Anulează, am folosit varianta din AssetEditor
        save: "Salvează",
        create: "Creează",
        delete: "Șterge",
        finish: "Termină",
        add: "Adaugă",
        edit: "Editează",
        yes: "Da",
        no: "Nu",
        back: "Înapoi"
      },
      layers: {
        title: "LAYERE",
        entities: "entități",
        table_btn: "Tabel",
        legend: "Legendă",
        export_geojson: "Exportă GeoJSON",
        upload_btn: "Import",
        new_layer_btn: "Nou"
      },
      modals: {
        settings_title: "Setări Layer",
        new_layer_title: "Layer Nou",
        layer_name: "Nume Layer",
        geometry_type: "Tip Geometrie",
        vis_type_single: "Culoare Unică",
        vis_type_unique: "Valori Unice (Coloană)",
        color: "Culoare Layer",
        select_column: "Selectează o coloană",
        choose_column: "Alege Coloana pentru Colorare",
        size_px: "Grosime / Mărime (px)",
        extrusion: "Extrudare (Volum 3D)",
        save_changes: "Salvează Modificările",
        comment_warning: "Stilizarea este blocată pentru comentarii. Acestea sunt afișate standard ca semnul exclamării (!)."
      },
      map_tools: {
        pos_mode: "MOD EDITARE POZIȚIE",
        pos_desc: "Dă click pe hartă pentru a muta elementul.",
        vertex_mode: "MOD EDITARE VERTEXI",
        vertex_desc_select: "Selectează un punct alb (vertex) pentru a-l muta.",
        vertex_desc_move: "Mută punctul și dă click pentru a fixa.",
        snap_on: "Lipește (Activ)",
        snap_off: "Lipește",
        active_layer: "Layer Activ:",
        add_feature: "Adaugă {{type}}",
        cancel_draw: "Anulează Desenarea"
      },
      table: {
        title: "Atribute:",
        manage_cols: "Gestionează Coloane",
        add_col_title: "Adaugă Coloană Nouă",
        col_name_placeholder: "Nume coloană",
        add_btn: "Add",
        existing_cols: "Coloane Existente:",
        no_cols: "Nicio coloană definită.",
        headers: {
          id: "ID",
          name: "Denumire",
          actions: "Acțiuni"
        },
        empty_cell: "empty" // sau "gol", dar în cod era "empty" (span mic)
      },
      editor: {
        new_entity: "Entitate Nouă",
        edit_entity: "Editare #{{id}}",
        layer_label: "Layer: {{name}}",
        geometry_section: "Geometrie",
        coord_x: "X (Lon)",
        coord_y: "Y (Lat)",
        coord_z: "Z (Altitudine)",
        btn_move_vertex: "Editează Poziția (Vertex)",
        btn_move_geo: "Mută geometria pe hartă",
        btn_edit_vertices: "Editează Vertexi",
        extrusion_label: "Extrudare (Înălțime)",
        unit_meters: "m",
        attributes_section: "Atribute (Tabel)",
        name_label: "Denumire"
      },
      alerts: {
        confirm_delete_layer: "Sigur ștergi acest layer?",
        delete_col_restricted: "Nu poți șterge coloana de extrudare.",
        confirm_delete_col: "Ștergi coloana \"{{colName}}\"?",
        confirm_delete_feature: "Stergi acest element?",
        too_few_points: "Prea puține puncte!",
        col_exists: "Coloana există deja!",
        import_success: "Succes! Au fost importate {{count}} elemente în layerul \"{{layerName}}\".",
        import_error: "Eroare la import: {{message}}",
        format_error: "Format invalid: Lipsește array-ul 'features'.",
        no_geo_error: "Nu au fost găsite geometrii valide.",
        type_error: "Tipul de geometrie {{type}} nu este suportat.",
        layer_create_error: "Layer-ul nu a putut fi creat.",
        db_layer_error: "Eroare db layers: {{message}}",
        db_feature_error: "Eroare db features: {{message}}",
        coords_error: "Nu s-au putut procesa coordonatele din fișier."
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;