import { useEffect, useState, useRef } from 'react';
import { Viewer, Entity, useCesium, Cesium3DTileset, PolylineGraphics, type CesiumComponentRef } from 'resium';
import { 
  Cartesian3, Color, ScreenSpaceEventType, Cartographic, 
  Math as CesiumMath, ScreenSpaceEventHandler, IonResource,
  Viewer as CesiumViewer, ClassificationType, createWorldTerrainAsync,
  TerrainProvider, defined, CallbackProperty, CallbackPositionProperty, PolygonHierarchy, 
  BoundingSphere, HeadingPitchRange, 
  ColorMaterialProperty, ConstantProperty
} from 'cesium';
import { 
  Group, Text, LoadingOverlay, Button, Badge, 
  Paper, Stack, ThemeIcon, ScrollArea, Box, Divider, ActionIcon,
  Modal, TextInput, Table, Select, Popover, ColorInput, NumberInput, SegmentedControl // <--- ADAUGAT AICI
} from '@mantine/core';
import { 
    IconMapPin, IconPolygon, IconRoute, IconPlus, IconTrash, 
    IconLayersIntersect, IconTable, IconEye, IconEyeOff, IconX, IconColumns3, IconSettings, IconHandStop, IconDeviceFloppy, IconMagnet
} from '@tabler/icons-react'; 
import { supabase } from './supabaseClient';
import { AssetEditor, type Asset } from './AssetEditor';

// --- DEFINIȚII TYPE ---
interface LayerColumn { name: string; type: string; }
interface Layer {
    id: number;
    name: string;
    type: 'POINT' | 'LINE' | 'POLYGON';
    style_props: { 
        color: string; 
        width?: number; 
        extrudedHeight?: number; 
        pixelSize?: number;
        visType?: 'single' | 'unique';
        visColumn?: string;
        visColorMap?: Record<string, string>; // <--- LINIE NOUA
    };
    visible: boolean;
    columns: LayerColumn[]; 
}
interface Feature {
    id: number;
    layer_id: number;
    position_data: any;
    properties: Record<string, string>;
}

const featureToAsset = (feature: Feature, layer: Layer): Asset => ({
    id: feature.id,
    name: feature.properties?.name || `Feature #${feature.id}`, 
    asset_type: layer.type,
    position_data: feature.position_data,
    style_props: layer.style_props, 
    properties: feature.properties || {},
    group_id: layer.name
});

const COLORS = {
    blue: '#0369A9', orange: '#EA5906', yellow: '#FDC203', cyan: '#06b6d4',
    darkGlass: 'rgba(11, 15, 25, 0.90)', glassBorder: 'rgba(255, 255, 255, 0.1)' 
};



// --- HELPER FUNCTION: Generare culoare din text ---
// --- PALETĂ DE CULORI DISTINCTE (pentru vizualizare pe valori) ---
const CATEGORY_PALETTE = [
    '#E6194B', // Roșu
    '#3CB44B', // Verde
    '#FFE119', // Galben
    '#4363D8', // Albastru
    '#F58231', // Portocaliu
    '#911EB4', // Mov
    '#42D4F4', // Cyan
    '#F032E6', // Magenta
    '#BFEF45', // Lime
    '#FABEBE', // Roz
    '#469990', // Teal
    '#DCBEFF', // Lavandă
];

const getColorForValue = (val: string) => {
    if (!val) return Color.GRAY; // Valori goale = Gri
    let hash = 0;
    const str = String(val);
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Alegem o culoare din paletă pe baza hash-ului (Modulo)
    const index = Math.abs(hash) % CATEGORY_PALETTE.length;
    return Color.fromCssColorString(CATEGORY_PALETTE[index]);
};

// --- COMPONENTA MAP EVENTS (HOVER STABIL + FIX EXTRUDE) ---
interface MapEventsProps {
    drawActive: boolean;
    relocateActive: boolean;
    isSnappingEnabled: boolean;
    features: Feature[];
    layers: Layer[];
    selectedFeatureId: number | null;
    onLeftClick: (cartesian: Cartesian3) => void;
    onDoubleClick: () => void;
    onMouseMoveGhost: (cartesian: Cartesian3) => void;
    onSelectionChange: (id: number | null) => void;
}

const MapEvents = ({ drawActive, relocateActive, isSnappingEnabled, features, layers, selectedFeatureId, onLeftClick, onDoubleClick, onMouseMoveGhost, onSelectionChange }: MapEventsProps) => {
  const { viewer } = useCesium();
  
  // Refs pentru a gestiona starea vizuala intern (fara re-randare React)
  const hoveredEntityRef = useRef<{ entity: any, originalColor: any, originalOutline?: any, originalSize?: any } | null>(null);
  const selectedEntityRef = useRef<{ entity: any, originalColor: any, originalOutline?: any } | null>(null);

  // === FIX CRITIC: PENTRU POLIGOANE EXTRUDATE ===
  useEffect(() => {
      if (viewer && !viewer.isDestroyed()) {
          // Aceasta setare opreste palpairea la poligoanele 3D transparente
          viewer.scene.pickTranslucentDepth = true;
      }
  }, [viewer]);

  // --- LOGICA SNAP ---
  const calculateSnap = (targetPos: Cartesian3) => {
      let nearestPos = null;
      let minDistance = 0.5; 

      features.forEach(f => {
          if (f.id === selectedFeatureId) return;
          const layer = layers.find(l => l.id === f.layer_id);
          if (!layer || !layer.visible) return;

          let vertices: Cartesian3[] = [];
          if (layer.type === 'POINT') {
              vertices.push(Cartesian3.fromDegrees(f.position_data.longitude, f.position_data.latitude, f.position_data.height));
          } else {
              vertices = (f.position_data as any[]).map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
          }

          vertices.forEach(v => {
              const dist = Cartesian3.distance(targetPos, v);
              if (dist < minDistance) { minDistance = dist; nearestPos = v; }
          });

          if (layer.type !== 'POINT' && vertices.length > 1) {
              const limit = layer.type === 'POLYGON' ? vertices.length : vertices.length - 1;
              for (let i = 0; i < limit; i++) {
                  const p1 = vertices[i];
                  const p2 = vertices[(i + 1) % vertices.length];
                  const segment = Cartesian3.subtract(p2, p1, new Cartesian3());
                  const pointVec = Cartesian3.subtract(targetPos, p1, new Cartesian3());
                  const segLenSq = Cartesian3.magnitudeSquared(segment);
                  if (segLenSq > 0) {
                      let t = Cartesian3.dot(pointVec, segment) / segLenSq;
                      t = Math.max(0, Math.min(1, t));
                      const closest = Cartesian3.add(p1, Cartesian3.multiplyByScalar(segment, t, new Cartesian3()), new Cartesian3());
                      const dist = Cartesian3.distance(targetPos, closest);
                      if (dist < minDistance) { minDistance = dist; nearestPos = closest; }
                  }
              }
          }
      });
      return nearestPos;
  };

  // --- HELPERE VIZUALE ---
// --- HELPERE VIZUALE ACTUALIZATE ---
  const highlightEntity = (entity: any, isHover: boolean) => {
      // Verificare de siguranță
      if (!viewer || viewer.isDestroyed()) return;

      // DEFINIRE CULORI CONFORM CERINȚEI
      // isHover = true  -> Hover (rămâne Cyan cum era înainte sau poți schimba)
      // isHover = false -> Selecție (CLICK) -> Alb cu contur Negru
      
      const targetColor = isHover ? Color.CYAN : Color.WHITE;
      const targetOutline = isHover ? Color.WHITE : Color.BLACK;
      const targetAlpha = isHover ? 0.7 : 0.9; // Mai opac la selecție

      if (entity.point) {
          entity.point.color = new ConstantProperty(targetColor);
          // Mărim punctul la selecție
          entity.point.pixelSize = new ConstantProperty(isHover ? 20 : 20);
          entity.point.outlineColor = new ConstantProperty(targetOutline);
          // Contur mai gros la selecție
          entity.point.outlineWidth = new ConstantProperty(isHover ? 2 : 4);
      } else if (entity.polyline) {
          // La linii nu avem "outline" standard simplu, așa că le facem albe complet
          entity.polyline.material = new ColorMaterialProperty(targetColor);
          entity.polyline.width = new ConstantProperty(isHover ? 8 : 8);
      } else if (entity.polygon) {
          // POLIGOANE: Alb + Contur Negru
          entity.polygon.material = new ColorMaterialProperty(targetColor.withAlpha(targetAlpha));
          entity.polygon.outlineColor = new ConstantProperty(targetOutline);
          // Contur vizibil (3px)
          entity.polygon.outlineWidth = new ConstantProperty(3);
      }
      viewer.scene.requestRender();
  };

  const restoreEntityVisuals = (data: { entity: any, originalColor: any, originalOutline?: any, originalSize?: any }) => {
      if (!viewer || viewer.isDestroyed()) return;
      try {
          const { entity, originalColor, originalOutline, originalSize } = data;
          if (entity.point) {
              entity.point.color = originalColor;
              entity.point.pixelSize = originalSize || new ConstantProperty(10);
              entity.point.outlineColor = new ConstantProperty(Color.YELLOW);
          } else if (entity.polyline) {
              entity.polyline.material = originalColor;
              entity.polyline.width = originalSize || new ConstantProperty(5);
          } else if (entity.polygon) {
              entity.polygon.material = originalColor;
              entity.polygon.outlineColor = originalOutline || new ConstantProperty(Color.WHITE);
              entity.polygon.outlineWidth = new ConstantProperty(1);
          }
          viewer.scene.requestRender();
      } catch (e) { /* Entity might have been deleted */ }
  };

  // --- EVENT LISTENERS ---
  useEffect(() => {
    if (!viewer || !viewer.scene) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    
    // CLICK
    handler.setInputAction((movement: any) => {
      if (!drawActive && !relocateActive) {
          const pickedObject = viewer.scene.pick(movement.position);
          if (defined(pickedObject) && pickedObject.id) {
              const entityId = pickedObject.id.id; 
              const clickedId = typeof entityId === 'string' ? parseInt(entityId) : null;
              
              if (clickedId && !isNaN(clickedId)) {
                  onSelectionChange(clickedId);
                  return;
              }
          } else {
              onSelectionChange(null);
          }
      }
      
      const pickedPosition = viewer.scene.pickPosition(movement.position);
      if (pickedPosition) onLeftClick(pickedPosition);
      else {
          const globePos = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
          if (globePos) onLeftClick(globePos);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    // DOUBLE CLICK
    handler.setInputAction(() => {
        if (drawActive) onDoubleClick();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // MOUSE MOVE
    handler.setInputAction((movement: any) => {
        // A. HOVER
        if (!drawActive && !relocateActive) {
            const pickedObject = viewer.scene.pick(movement.endPosition);
            
            // Avem o entitate sub mouse?
            if (defined(pickedObject) && pickedObject.id) {
                const entity = pickedObject.id;
                
                // EXIT RAPID: Daca suntem deja pe aceeasi entitate, nu facem nimic (previne re-randarea)
                if (hoveredEntityRef.current?.entity === entity) {
                    return; 
                }

                // Daca am trecut pe altceva, restauram vechiul
                if (hoveredEntityRef.current) {
                    restoreEntityVisuals(hoveredEntityRef.current);
                    hoveredEntityRef.current = null;
                }

                // Verificam daca e feature-ul nostru
                const entityId = entity.id;
                const isOurFeature = typeof entityId === 'string' && !isNaN(parseInt(entityId));
                
                // Aplicam hover doar daca nu e selectat deja
                if (isOurFeature && entity !== selectedEntityRef.current?.entity) {
                    // Salvam starea originala
                    let originalColor, originalOutline, originalSize;
                    if (entity.point) { originalColor = entity.point.color; originalSize = entity.point.pixelSize; }
                    else if (entity.polyline) { originalColor = entity.polyline.material; originalSize = entity.polyline.width; }
                    else if (entity.polygon) { originalColor = entity.polygon.material; originalOutline = entity.polygon.outlineColor; }
                    
                    hoveredEntityRef.current = { entity, originalColor, originalOutline, originalSize };
                    highlightEntity(entity, true); 
                    viewer.canvas.style.cursor = 'pointer';
                }
            } else {
                // Nu suntem pe nimic -> Resetam Hover-ul
                if (hoveredEntityRef.current) {
                    restoreEntityVisuals(hoveredEntityRef.current);
                    hoveredEntityRef.current = null;
                    viewer.canvas.style.cursor = 'default';
                }
            }
        } else {
            // Mod Desenare/Mutare - curatam hover
            if (hoveredEntityRef.current) {
                restoreEntityVisuals(hoveredEntityRef.current);
                hoveredEntityRef.current = null;
            }
            viewer.canvas.style.cursor = relocateActive ? (isSnappingEnabled ? 'copy' : 'grabbing') : 'crosshair';
        }

        // B. GHOST & SNAP
        if (relocateActive) {
            const pickedPosition = viewer.scene.pickPosition(movement.endPosition);
            let targetPos = pickedPosition || viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
            
            if (targetPos) {
                if (isSnappingEnabled) {
                    const snapped = calculateSnap(targetPos);
                    if (snapped) targetPos = snapped;
                }
                onMouseMoveGhost(targetPos);
            }
        }

    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => { if (!handler.isDestroyed()) handler.destroy(); };
  }, [viewer, drawActive, relocateActive, isSnappingEnabled, onLeftClick, onDoubleClick, onMouseMoveGhost, onSelectionChange, features, layers]);
  
  // Monitorizează schimbarea selecției
  useEffect(() => {
      if (!viewer) return;
      
      // Curatam hover cand selectam ceva
      if (hoveredEntityRef.current) {
          restoreEntityVisuals(hoveredEntityRef.current);
          hoveredEntityRef.current = null;
      }

      // Curatam vechea selectie
      if (selectedEntityRef.current) {
          restoreEntityVisuals(selectedEntityRef.current);
          selectedEntityRef.current = null;
      }

      // Aplicam noua selectie
      if (selectedFeatureId) {
          const entity = viewer.entities.getById(selectedFeatureId.toString());
          if (entity) {
              let originalColor, originalOutline;
              if (entity.point) originalColor = entity.point.color;
              else if (entity.polyline) originalColor = entity.polyline.material;
              else if (entity.polygon) { originalColor = entity.polygon.material; originalOutline = entity.polygon.outlineColor; }
              
              selectedEntityRef.current = { entity, originalColor, originalOutline };
              highlightEntity(entity, false); // False = Selection (Yellow)
          }
      }
  }, [selectedFeatureId, viewer, features]);

  return null;
}


function App() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeLayerId, setActiveLayerId] = useState<number | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(false); 
  const [tempPoints, setTempPoints] = useState<Cartesian3[]>([]);

  const ghostPositionRef = useRef<any>(null); 

  const [showNewLayerModal, setShowNewLayerModal] = useState(false);
  const [tempLayerSettings, setTempLayerSettings] = useState<Layer | null>(null); 
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState<string | null>('POINT');
  const [openAttributeTableId, setOpenAttributeTableId] = useState<number | null>(null);
  const [newColumnName, setNewColumnName] = useState('');

  const [terrainProvider, setTerrainProvider] = useState<TerrainProvider | undefined>(undefined);
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);

  useEffect(() => { 
      fetchData(); 
      createWorldTerrainAsync().then(setTerrainProvider).catch(console.error);
  }, []);

  const fetchData = async () => {
      setLoading(true);
      const { data: layersData } = await supabase.from('layers').select('*').order('id');
      const { data: featuresData } = await supabase.from('features').select('*');
      
      const processedLayers = layersData?.map(l => ({ ...l, columns: l.columns || [] })) || [];

      if (layersData) setLayers(processedLayers);
      if (featuresData) setFeatures(featuresData);
      setLoading(false);
  };

  const zoomToFeature = (feature: Feature) => {
      const layer = layers.find(l => l.id === feature.layer_id);
      if (!layer || !viewerRef.current?.cesiumElement) return;
      const viewer = viewerRef.current.cesiumElement;

      if (layer.type === 'POINT') {
          const p = feature.position_data;
          const destination = Cartesian3.fromDegrees(p.longitude, p.latitude, p.height + 200); 
          viewer.camera.flyTo({ destination: destination, duration: 1.5 });
      } else {
          const positions = (feature.position_data as any[]).map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
          if (positions.length > 0) {
              const boundingSphere = BoundingSphere.fromPoints(positions);
              viewer.camera.flyToBoundingSphere(boundingSphere, { duration: 1.5, offset: new HeadingPitchRange(0, -0.5, boundingSphere.radius * 2.5) } as any);
          }
      }
  };

  const openLayerSettings = (layer: Layer) => setTempLayerSettings(JSON.parse(JSON.stringify(layer)));
  const saveLayerSettings = async () => {
      if (!tempLayerSettings) return;
      setLoading(true);
      await supabase.from('layers').update({ style_props: tempLayerSettings.style_props }).eq('id', tempLayerSettings.id);
      setLayers(layers.map(l => l.id === tempLayerSettings.id ? tempLayerSettings : l));
      setLoading(false); setTempLayerSettings(null); 
  };
  // --- HANDLER NOU: Schimbă culoarea unei categorii specifice ---
  const handleCategoryColorChange = async (layerId: number, category: string, newColor: string) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;

      const updatedColorMap = { ...(layer.style_props.visColorMap || {}), [category]: newColor };
      const updatedStyle = { ...layer.style_props, visColorMap: updatedColorMap };

      // Actualizăm starea locală instant
      setLayers(layers.map(l => l.id === layerId ? { ...l, style_props: updatedStyle } : l));

      // Salvăm în baza de date (debounce ar fi ideal aici, dar facem direct pentru simplitate)
      await supabase.from('layers').update({ style_props: updatedStyle }).eq('id', layerId);
  };
  const handleCreateLayer = async () => {
      if (!newLayerName || !newLayerType) return;
      setLoading(true);
      const defaultStyle = newLayerType === 'POINT' ? { color: COLORS.orange, pixelSize: 15 } : newLayerType === 'LINE' ? { color: COLORS.cyan, width: 5 } : { color: COLORS.blue, extrudedHeight: 0 };
      const initialColumns = newLayerType === 'POLYGON' ? [{ name: 'extrudare', type: 'number' }] : [];
      const { data } = await supabase.from('layers').insert([{ name: newLayerName, type: newLayerType, style_props: defaultStyle, visible: true, columns: initialColumns }]).select();
      if (data) { setLayers([...layers, { ...data[0], columns: initialColumns }]); setActiveLayerId(data[0].id); }
      setShowNewLayerModal(false); setNewLayerName(''); setLoading(false);
  };
  const toggleLayerVisibility = async (layerId: number, currentVisible: boolean) => {
      await supabase.from('layers').update({ visible: !currentVisible }).eq('id', layerId);
      setLayers(layers.map(l => l.id === layerId ? { ...l, visible: !currentVisible } : l));
  };
  const deleteLayer = async (layerId: number) => {
      if (!confirm("Sigur ștergi acest layer?")) return;
      setLoading(true);
      await supabase.from('layers').delete().eq('id', layerId);
      setLayers(layers.filter(l => l.id !== layerId));
      setFeatures(features.filter(f => f.layer_id !== layerId));
      if (activeLayerId === layerId) setActiveLayerId(null);
      setLoading(false);
  };
  const addColumnToLayer = async (layerId: number) => {
      if (!newColumnName.trim()) return;
      const layer = layers.find(l => l.id === layerId); if (!layer) return;
      if (layer.columns.some(c => c.name === newColumnName)) return alert("Coloana există deja!");
      const updatedColumns = [...layer.columns, { name: newColumnName, type: 'text' }];
      setLoading(true);
      await supabase.from('layers').update({ columns: updatedColumns }).eq('id', layerId);
      setLayers(layers.map(l => l.id === layerId ? { ...l, columns: updatedColumns } : l));
      setNewColumnName(''); setLoading(false);
  };
  const deleteColumnFromLayer = async (layerId: number, colName: string) => {
      if (colName === 'extrudare') return alert("Nu poți șterge coloana de extrudare.");
      if (!confirm(`Ștergi coloana "${colName}"?`)) return;
      const layer = layers.find(l => l.id === layerId); if (!layer) return;
      const updatedColumns = layer.columns.filter(c => c.name !== colName);
      setLoading(true);
      await supabase.from('layers').update({ columns: updatedColumns }).eq('id', layerId);
      setLayers(layers.map(l => l.id === layerId ? { ...l, columns: updatedColumns } : l));
      setLoading(false);
  };
  const handleSaveFeatureEdit = async (editedAsset: Asset) => {
      setLoading(true);
      const propertiesToSave = { ...editedAsset.properties, name: editedAsset.name };
      await supabase.from('features').update({ position_data: editedAsset.position_data, properties: propertiesToSave }).eq('id', editedAsset.id);
      setFeatures(features.map(f => f.id === editedAsset.id ? { ...f, position_data: editedAsset.position_data, properties: propertiesToSave as any } : f));
      setSelectedFeatureId(null); setLoading(false);
  };
  const handleDeleteFeature = async (id: number) => {
      if(!confirm("Stergi acest element?")) return;
      await supabase.from('features').delete().eq('id', id);
      setFeatures(features.filter(f => f.id !== id));
      setSelectedFeatureId(null);
  };

  const handleMouseMoveGhost = (cartesian: Cartesian3) => {
      if (isRelocating && selectedFeatureId) {
          const feature = features.find(f => f.id === selectedFeatureId);
          const layer = layers.find(l => l.id === feature?.layer_id);
          if (!feature || !layer) return;

          let targetPosition = cartesian;
          if (layer.type === 'POINT') {
              ghostPositionRef.current = targetPosition;
          } else {
              const oldFirstPoint = (feature.position_data as any[])[0];
              const cOldStart = Cartesian3.fromDegrees(oldFirstPoint.longitude, oldFirstPoint.latitude, oldFirstPoint.height);
              const delta = Cartesian3.subtract(targetPosition, cOldStart, new Cartesian3());
              const newPosArray = (feature.position_data as any[]).map((p: any) => {
                  const pCart = Cartesian3.fromDegrees(p.longitude, p.latitude, p.height);
                  return Cartesian3.add(pCart, delta, new Cartesian3());
              });
              ghostPositionRef.current = newPosArray;
          }
      }
  };

  const startRelocation = () => {
      const feature = features.find(f => f.id === selectedFeatureId);
      if (!feature) return;
      if (Array.isArray(feature.position_data)) {
           ghostPositionRef.current = feature.position_data.map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
      } else {
           const p = feature.position_data;
           ghostPositionRef.current = Cartesian3.fromDegrees(p.longitude, p.latitude, p.height);
      }
      setIsRelocating(true);
  };

  const ghostPointPosition = new CallbackPositionProperty(() => ghostPositionRef.current, false);
  const ghostShapePositions = new CallbackProperty(() => ghostPositionRef.current || [], false);
  const ghostPolygonHierarchy = new CallbackProperty(() => new PolygonHierarchy(ghostPositionRef.current || []), false);

  const handleMapClick = (cartesian: Cartesian3) => {
      if (isRelocating && selectedFeatureId) {
          const finalPos = ghostPositionRef.current;
          if(finalPos) confirmRelocation(selectedFeatureId, finalPos);
          return;
      }
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (!isDrawing || !activeLayer) return;
      if (activeLayer.type === 'POINT') saveNewFeature(activeLayer, [cartesian]);
      else setTempPoints([...tempPoints, cartesian]);
  };

  const confirmRelocation = async (featureId: number, rawPosData: any) => {
      const feature = features.find(f => f.id === featureId);
      const layer = layers.find(l => l.id === feature?.layer_id);
      if (!feature || !layer) return;
      setLoading(true);
      let newPosDataDb;
      if (layer.type === 'POINT') {
          const c = Cartographic.fromCartesian(rawPosData as Cartesian3);
          newPosDataDb = { longitude: CesiumMath.toDegrees(c.longitude), latitude: CesiumMath.toDegrees(c.latitude), height: c.height };
      } else {
          newPosDataDb = (rawPosData as Cartesian3[]).map((p: Cartesian3) => {
              const c = Cartographic.fromCartesian(p);
              return { longitude: CesiumMath.toDegrees(c.longitude), latitude: CesiumMath.toDegrees(c.latitude), height: c.height };
          });
      }
      await supabase.from('features').update({ position_data: newPosDataDb }).eq('id', featureId);
      setFeatures(features.map(f => f.id === featureId ? { ...f, position_data: newPosDataDb } : f));
      setIsRelocating(false); ghostPositionRef.current = null; setLoading(false);
  };

  const handleMapDoubleClick = () => {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (!isDrawing || !activeLayer || activeLayer.type === 'POINT') return;
      if (tempPoints.length < 2) return alert("Prea puține puncte!");
      saveNewFeature(activeLayer, tempPoints);
  };

  const saveNewFeature = async (layer: Layer, positions: Cartesian3[]) => {
      setLoading(true);
      const coords = layer.type === 'POINT' ? { longitude: CesiumMath.toDegrees(Cartographic.fromCartesian(positions[0]).longitude), latitude: CesiumMath.toDegrees(Cartographic.fromCartesian(positions[0]).latitude), height: Cartographic.fromCartesian(positions[0]).height } : positions.map(p => ({ longitude: CesiumMath.toDegrees(Cartographic.fromCartesian(p).longitude), latitude: CesiumMath.toDegrees(Cartographic.fromCartesian(p).latitude), height: Cartographic.fromCartesian(p).height }));
      const initialProps: Record<string, string> = {};
      layer.columns.forEach(col => { if (col.name === 'extrudare') initialProps[col.name] = '0'; else initialProps[col.name] = ""; });
      const { data } = await supabase.from('features').insert([{ layer_id: layer.id, position_data: coords, properties: { ...initialProps, name: `New ${layer.type}` } }]).select();
      if (data) setFeatures([...features, data[0]]);
      setIsDrawing(false); setTempPoints([]); setLoading(false);
  };

  const glassPanelStyle = { backgroundColor: COLORS.darkGlass, backdropFilter: 'blur(16px)', border: `1px solid ${COLORS.glassBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', color: 'white' };
  const activeTableLayer = layers.find(l => l.id === openAttributeTableId);
  const activeTableFeatures = features.filter(f => f.layer_id === openAttributeTableId);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', cursor: isRelocating ? (isSnappingEnabled ? 'copy' : 'grabbing') : 'default' }}>
        
        {/* HEADER */}
        <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: 20, zIndex: 10, borderLeft: `3px solid ${COLORS.blue}`, width: 300 }} p="xs" radius="sm">
            <Group gap={10}><ThemeIcon size="lg" variant="filled" color="dark" radius="sm"><IconLayersIntersect size={20} color={COLORS.blue} /></ThemeIcon><div><Text fw={900} size="lg" style={{ fontFamily: 'Rajdhani, sans-serif' }}>TERRA<span style={{ color: COLORS.blue }}>GIS</span></Text><Text size="xs" c="dimmed">Layer Management System</Text></div></Group>
        </Paper>

        {/* LAYER MANAGER */}
        <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 90, left: 20, bottom: openAttributeTableId ? '40%' : 30, width: 300, zIndex: 10, display: 'flex', flexDirection: 'column' }} radius="sm">
            <Box p="sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}><Group justify="space-between" mb="xs"><Text size="xs" fw={700} c="dimmed">LAYERE ({layers.length})</Text><Button size="xs" color="blue" variant="light" leftSection={<IconPlus size={14}/>} onClick={() => setShowNewLayerModal(true)}>Layer Nou</Button></Group></Box>
            <ScrollArea style={{ flex: 1 }} p="xs">
                <Stack gap={8}>
                    {layers.map(layer => {
                        const isActive = activeLayerId === layer.id;
                        return (
<Paper key={layer.id} p="xs" radius="sm" style={{ backgroundColor: isActive ? 'rgba(3, 105, 169, 0.2)' : 'rgba(255,255,255,0.03)', border: isActive ? `1px solid ${COLORS.blue}` : '1px solid transparent', cursor: 'pointer' }} onClick={() => { setActiveLayerId(layer.id); setIsDrawing(false); }}>
                                <Group justify="space-between" mb={4}>
                                    <Group gap={8}>
                                        {layer.type === 'POINT' && <IconMapPin size={16} color={COLORS.orange} style={{ opacity: 0.8 }} />}
                                        {layer.type === 'LINE' && <IconRoute size={16} color={COLORS.blue} style={{ opacity: 0.8 }} />}
                                        {layer.type === 'POLYGON' && <IconPolygon size={16} color={COLORS.yellow} style={{ opacity: 0.8 }} />}
                                        <Text size="sm" fw={700} c="white">{layer.name}</Text>
                                    </Group>
                                    <Group gap={2}>
                                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); openLayerSettings(layer); }}><IconSettings size={14}/></ActionIcon>
                                        <ActionIcon size="sm" variant="subtle" color={layer.visible ? 'gray' : 'red'} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id, layer.visible); }}>{layer.visible ? <IconEye size={14}/> : <IconEyeOff size={14}/>}</ActionIcon>
                                        <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}><IconTrash size={14}/></ActionIcon>
                                    </Group>
                                </Group>
                                <Group justify="space-between" mb={layer.style_props.visType === 'unique' ? 8 : 0}>
                                    <Badge size="xs" variant="filled" color="dark">{features.filter(f => f.layer_id === layer.id).length} entități</Badge>
                                    <Button size="compact-xs" variant="subtle" color="cyan" leftSection={<IconTable size={12}/>} onClick={(e) => { e.stopPropagation(); setOpenAttributeTableId(openAttributeTableId === layer.id ? null : layer.id); }}>Tabel</Button>
                                </Group>

                                {/* --- LEGENDĂ DINAMICĂ (EXPAND) --- */}
{/* --- LEGENDĂ DINAMICĂ (CORECȚIE) --- */}
                                {layer.style_props.visType === 'unique' && layer.style_props.visColumn && (
                                    <Box mt="xs" p="xs" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                                        <Text size="xs" c="dimmed" mb={4}>Legendă ({layer.style_props.visColumn}):</Text>
                                        <Stack gap={4}>
                                            {Array.from(new Set(features.filter(f => f.layer_id === layer.id).map(f => f.properties[layer.style_props.visColumn!] || 'N/A'))).sort().map(val => {
                                                
                                                // 1. Verificăm dacă avem o culoare salvată manual (este String)
                                                const savedColor = layer.style_props.visColorMap ? layer.style_props.visColorMap[val] : undefined;
                                                
                                                // 2. Generăm culoarea automată (este Obiect Color)
                                                const autoColorObj = getColorForValue(val);
                                                
                                                // 3. Normalizăm totul la un string CSS pentru Input
                                                // Dacă avem savedColor, o folosim. Altfel convertim obiectul Color la string.
                                                const displayColorString = savedColor || autoColorObj.toCssColorString();

                                                return (
                                                    <Group key={val} justify="space-between" gap={4}>
                                                        <Text size="xs" c="white" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</Text>
                                                        <ColorInput 
                                                            size="xs" 
                                                            value={displayColorString} 
                                                            onChange={(c) => handleCategoryColorChange(layer.id, val, c)}
                                                            onClick={(e) => e.stopPropagation()} 
                                                            styles={{ input: { width: 60, height: 20, minHeight: 20, padding: 0, paddingLeft: 24, fontSize: 10 }, swatch: { width: 14, height: 14 } }}
                                                        />
                                                    </Group>
                                                );
                                            })}
                                        </Stack>
                                    </Box>
                                )}
                            </Paper>
                        )
                    })}
                </Stack>
            </ScrollArea>
        </Paper>

        <Modal opened={!!tempLayerSettings} onClose={() => setTempLayerSettings(null)} title="Setări Layer" centered styles={{ content: { backgroundColor: '#1A1B1E', color: 'white' }, header: { backgroundColor: '#1A1B1E', color: 'white' } }}>
            {tempLayerSettings && (<Stack><TextInput label="Nume Layer" value={tempLayerSettings.name} disabled styles={{ input: { backgroundColor: '#2C2E33', color: '#999' } }}/>{/* SELECTOR MOD VIZUALIZARE */}
            <SegmentedControl 
                fullWidth
                data={[{ label: 'Culoare Unică', value: 'single' }, { label: 'Valori Unice (Coloană)', value: 'unique' }]}
                value={tempLayerSettings.style_props.visType || 'single'}
                onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, visType: val as any } })}
                mb="xs"
            />

            {/* LOGICA AFISARE INPUT: CULOARE vs COLOANA */}
            {(!tempLayerSettings.style_props.visType || tempLayerSettings.style_props.visType === 'single') ? (
                <ColorInput 
                    label="Culoare Layer" 
                    value={tempLayerSettings.style_props.color} 
                    onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, color: val } })} 
                />
            ) : (
                <Select
                    label="Alege Coloana pentru Colorare"
                    placeholder="Selectează o coloană"
                    data={tempLayerSettings.columns.map(c => c.name)}
                    value={tempLayerSettings.style_props.visColumn || null}
                    onChange={(val) => setTempLayerSettings({ 
                        ...tempLayerSettings, 
                        style_props: { 
                            ...tempLayerSettings.style_props, 
                            visColumn: val || undefined // <--- AICI ESTE FIX-UL (convertim null in undefined)
                        } 
                    })}
                />
            )}{tempLayerSettings.type !== 'POLYGON' && <NumberInput label="Grosime / Mărime (px)" value={tempLayerSettings.type === 'POINT' ? tempLayerSettings.style_props.pixelSize : tempLayerSettings.style_props.width} onChange={(val) => { const key = tempLayerSettings.type === 'POINT' ? 'pixelSize' : 'width'; setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, [key]: Number(val) } }) }} />}{tempLayerSettings.type === 'POLYGON' && <NumberInput label="Extrudare (Volum 3D)" value={tempLayerSettings.style_props.extrudedHeight} onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, extrudedHeight: Number(val) } })} />}<Divider my="sm" /><Group justify="flex-end"><Button variant="default" onClick={() => setTempLayerSettings(null)}>Anulează</Button><Button color="blue" onClick={saveLayerSettings} leftSection={<IconDeviceFloppy size={16}/>}>Salvează Modificările</Button></Group></Stack>)}
        </Modal>

        <Modal opened={showNewLayerModal} onClose={() => setShowNewLayerModal(false)} title="Layer Nou" centered styles={{ content: { backgroundColor: '#1A1B1E', color: 'white' }, header: { backgroundColor: '#1A1B1E', color: 'white' } }}>
            <Stack><TextInput label="Nume Layer" value={newLayerName} onChange={(e) => setNewLayerName(e.target.value)} styles={{ input: { backgroundColor: '#2C2E33', color: 'white' } }}/><Select label="Tip Geometrie" data={['POINT', 'LINE', 'POLYGON']} value={newLayerType} onChange={setNewLayerType} styles={{ input: { backgroundColor: '#2C2E33', color: 'white' } }} /><Button fullWidth onClick={handleCreateLayer} color="blue">Creează</Button></Stack>
        </Modal>

        {isRelocating && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, borderColor: isSnappingEnabled ? COLORS.cyan : COLORS.yellow }} p="md" radius="sm">
                <Group><IconHandStop size={24} color={isSnappingEnabled ? COLORS.cyan : COLORS.yellow} /><div><Text fw={700} c="white">MOD EDITARE POZIȚIE</Text><Text size="xs" c="dimmed">Dă click pe hartă pentru a muta elementul.</Text></div><Button size="xs" color={isSnappingEnabled ? "cyan" : "gray"} variant={isSnappingEnabled ? "filled" : "outline"} leftSection={<IconMagnet size={16} />} onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}>{isSnappingEnabled ? "Lipește (Activ)" : "Lipește"}</Button><Button size="xs" color="red" variant="light" onClick={() => { setIsRelocating(false); ghostPositionRef.current = null; }}>Anulează</Button></Group>
            </Paper>
        )}

        {activeLayerId && !isRelocating && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }} p="xs" radius="sm">
                <Group><Text size="sm" c="dimmed">Layer Activ:</Text><Text size="sm" fw={700} c={COLORS.yellow}>{layers.find(l => l.id === activeLayerId)?.name}</Text><Divider orientation="vertical" />{!isDrawing ? (<Button color="green" size="xs" leftSection={<IconPlus size={16}/>} onClick={() => { setIsDrawing(true); setIsRelocating(false); }}>Adaugă {layers.find(l => l.id === activeLayerId)?.type}</Button>) : (<Button color="red" size="xs" onClick={() => { setIsDrawing(false); setTempPoints([]); }}>Anulează Desenarea</Button>)}</Group>
            </Paper>
        )}

        {activeTableLayer && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', bottom: 20, left: 20, right: 20, height: '35%', zIndex: 20, display: 'flex', flexDirection: 'column' }} radius="sm">
                <Box p="xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}><Group justify="space-between"><Group><IconTable size={18} color={COLORS.cyan} /><Text fw={700} c="white">Atribute: <span style={{ color: COLORS.yellow }}>{activeTableLayer.name}</span></Text><Divider orientation="vertical" /><Popover width={300} trapFocus position="bottom" withArrow shadow="md"><Popover.Target><Button size="compact-xs" variant="light" leftSection={<IconColumns3 size={14}/>}>Gestionează Coloane</Button></Popover.Target><Popover.Dropdown bg="dark.8"><Stack gap="xs"><Text size="xs" fw={700}>Adaugă Coloană Nouă</Text><Group gap={4}><TextInput size="xs" placeholder="Nume coloană" value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} /><Button size="xs" onClick={() => addColumnToLayer(activeTableLayer.id)}>Add</Button></Group><Divider my={4}/><Text size="xs" fw={700}>Coloane Existente:</Text><Group gap={4} style={{flexWrap: 'wrap'}}>{activeTableLayer.columns.length === 0 && <Text size="xs" c="dimmed">Nicio coloană definită.</Text>}{activeTableLayer.columns.map(col => (<Badge key={col.name} size="lg" variant="outline" rightSection={<ActionIcon size="xs" color="red" variant="transparent" onClick={() => deleteColumnFromLayer(activeTableLayer.id, col.name)}><IconX size={10} /></ActionIcon>}>{col.name}</Badge>))}</Group></Stack></Popover.Dropdown></Popover></Group><ActionIcon variant="subtle" color="gray" onClick={() => setOpenAttributeTableId(null)}><IconX size={16}/></ActionIcon></Group></Box>
                <ScrollArea style={{ flex: 1 }}>
                    <Table stickyHeader highlightOnHover verticalSpacing="xs">
                        <Table.Thead><Table.Tr><Table.Th style={{ color: '#aaa' }}>ID</Table.Th><Table.Th style={{ color: '#aaa' }}>Denumire</Table.Th>{activeTableLayer.columns.map(col => (<Table.Th key={col.name} style={{ color: COLORS.cyan }}>{col.name}</Table.Th>))}<Table.Th style={{ color: '#aaa' }}>Acțiuni</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {activeTableFeatures.map(f => (
                                <Table.Tr key={f.id} style={{ cursor: 'pointer', backgroundColor: selectedFeatureId === f.id ? 'rgba(3, 105, 169, 0.2)' : 'transparent' }} onClick={() => setSelectedFeatureId(f.id)} onDoubleClick={() => zoomToFeature(f)}>
                                    <Table.Td style={{ color: 'white' }}>{f.id}</Table.Td><Table.Td style={{ color: 'white' }}>{f.properties.name || '-'}</Table.Td>{activeTableLayer.columns.map(col => (<Table.Td key={col.name} style={{ color: 'white' }}>{f.properties[col.name] || <span style={{color:'gray', fontSize:'10px'}}>empty</span>}</Table.Td>))}<Table.Td><ActionIcon size="sm" color="red" variant="subtle" onClick={(e) => { e.stopPropagation(); handleDeleteFeature(f.id); }}><IconTrash size={14}/></ActionIcon></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        )}

        {selectedFeatureId && (
             <div style={{ position: 'absolute', top: 90, right: 20, zIndex: 15 }}>
                 <AssetEditor 
                    asset={featureToAsset(features.find(f => f.id === selectedFeatureId)!, layers.find(l => l.id === features.find(f => f.id === selectedFeatureId)?.layer_id)!)}
                    layer={layers.find(l => l.id === features.find(f => f.id === selectedFeatureId)?.layer_id)!}
                    isNew={false}
                    onSave={handleSaveFeatureEdit}
                    onDelete={handleDeleteFeature}
                    onCancel={() => setSelectedFeatureId(null)}
                    onStartRelocate={startRelocation}
                 />
             </div>
        )}

        <Viewer 
            ref={viewerRef} full selectionIndicator={false} infoBox={false} timeline={false} animation={false} 
            navigationHelpButton={false} sceneModePicker={false} baseLayerPicker={false} homeButton={false} geocoder={false} fullscreenButton={false}
            terrainProvider={terrainProvider}
        >
             <Cesium3DTileset url={IonResource.fromAssetId(2275207)} />
             {/* MAP EVENTS (HOVER, CLICK, SNAP) */}
             <MapEvents 
                drawActive={isDrawing} 
                relocateActive={isRelocating} 
                isSnappingEnabled={isSnappingEnabled}
                features={features}
                layers={layers}
                selectedFeatureId={selectedFeatureId}
                onLeftClick={handleMapClick} 
                onDoubleClick={handleMapDoubleClick} 
                onMouseMoveGhost={handleMouseMoveGhost} 
                onSelectionChange={setSelectedFeatureId}
             />

             {/* RENDER STATIC (FĂRĂ UPDATE LA HOVER!) */}
            {/* RENDER STATIC */}
            {layers.filter(l => l.visible).map(layer => {
                const layerFeatures = features.filter(f => f.layer_id === layer.id);
                return layerFeatures.map(feature => {
                    // Dacă relocăm, nu randăm originalul
                    if (isRelocating && feature.id === selectedFeatureId) return null;

                    const style = layer.style_props;
                    const extrusionValue = Number(feature.properties.extrudare) || 0;
                    const isExtruded = extrusionValue > 0;
                    
                    // --- LOGICA NOUĂ DE CULOARE PENTRU SELECȚIE ---
                    const isSelected = selectedFeatureId === feature.id;

                    // 1. Culoarea de bază (din stil sau Alb dacă e selectat)
// --- LOGICA CULOARE DINAMICĂ ACTUALIZATĂ ---
                    let baseColor;
                    
                    // Verificăm dacă utilizatorul a ales "Valori Unice" (unique) și a selectat o coloană validă
                    if (style.visType === 'unique' && style.visColumn) {
                        // Luăm valoarea din acea coloană pentru entitatea curentă
                        const val = feature.properties[style.visColumn];
                        // O trecem prin funcția care alege o culoare din paleta vibrantă
                        baseColor = getColorForValue(val);
                    } else {
                        // Altfel, folosim culoarea unică a layerului
                        baseColor = Color.fromCssColorString(style.color);
                    }

                    // Dacă obiectul e selectat (click), îl facem ALB indiferent de regula de mai sus
                    const displayColor = isSelected ? Color.WHITE : baseColor;

                    // 2. Conturul (Alb standard sau Negru dacă e selectat)
                    const outlineColor = isSelected ? Color.BLACK : Color.WHITE;

                    // 3. Opacitate (Mai solid dacă e selectat)
                    const alpha = isSelected ? 0.9 : 0.6;
                    const materialColor = displayColor.withAlpha(alpha);
                    
                    // 4. Grosime contur
                    const outlineWidth = isSelected ? 3 : 1;
                    // ----------------------------------------------

                    if (layer.type === 'POINT') {
                        const pos = Cartesian3.fromDegrees(feature.position_data.longitude, feature.position_data.latitude, feature.position_data.height);
                        return <Entity 
                        id={feature.id.toString()}
                        key={feature.id} 
                        position={pos} 
                        point={{ 
                            pixelSize: style.pixelSize || 10, 
                            color: materialColor, // Folosim culoarea calculată
                            outlineColor: outlineColor, // Folosim conturul calculat
                            outlineWidth: isSelected ? 2 : 0, // Contur vizibil doar la selecție pt puncte
                            disableDepthTestDistance: Number.POSITIVE_INFINITY 
                        }} 
                        />;
                    } 
                    else if (layer.type === 'LINE') {
                        const positions = (feature.position_data as any[]).map(p => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                        return <Entity 
                        id={feature.id.toString()}
                        key={feature.id} 
                        polyline={{ 
                            positions, 
                            width: style.width || 5, 
                            material: isSelected ? Color.WHITE : baseColor // Liniile nu au outline standard, le facem albe complet
                        }} 
                        />;
                    }
                    else {
                        // POLYGON
                        const hierarchy = (feature.position_data as any[]).map(p => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                        return <Entity 
                        id={feature.id.toString()}
                        key={feature.id} 
                        polygon={{ 
                            hierarchy, 
                            extrudedHeight: isExtruded ? (feature.position_data[0].height + extrusionValue) : undefined, 
                            perPositionHeight: isExtruded, 
                            classificationType: !isExtruded ? ClassificationType.CESIUM_3D_TILE : undefined, 
                            
                            material: materialColor, // Culoarea calculată sus
                            outline: true, 
                            outlineColor: outlineColor, // Conturul calculat sus
                            outlineWidth: outlineWidth 
                        }} 
                        />;
                    }
                });
            })}

             {/* GHOST RENDER */}
             {isRelocating && selectedFeatureId && (
                 (() => {
                     const feature = features.find(f => f.id === selectedFeatureId);
                     const layer = layers.find(l => l.id === feature?.layer_id);
                     if (!layer) return null;
                     
                     if (layer.type === 'POINT') {
                         return <Entity position={ghostPointPosition} point={{ pixelSize: 15, color: Color.CYAN.withAlpha(0.8), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} />;
                     } 
                     else if (layer.type === 'LINE') {
                         return <Entity polyline={{ positions: ghostShapePositions, width: 6, material: Color.CYAN.withAlpha(0.8) }} />;
                     }
                     else {
                         const extrusionValue = Number(feature?.properties.extrudare) || 0;
                         const isExtruded = extrusionValue > 0;
                         return <Entity polygon={{ hierarchy: ghostPolygonHierarchy, material: Color.CYAN.withAlpha(0.4), outline: true, outlineColor: Color.WHITE, outlineWidth: 3, extrudedHeight: isExtruded ? new CallbackProperty(() => { const pos = ghostPositionRef.current; if(!pos || !pos[0]) return undefined; const c = Cartographic.fromCartesian(pos[0]); return c.height + extrusionValue; }, false) : undefined, perPositionHeight: isExtruded, classificationType: !isExtruded ? ClassificationType.CESIUM_3D_TILE : undefined }} />;
                     }
                 })()
             )}

             {isDrawing && tempPoints.length > 0 && (
                <Entity>
                    <PolylineGraphics positions={tempPoints} width={2} material={Color.YELLOW} />
                    {tempPoints.map((p, i) => <Entity key={i} position={p} point={{ pixelSize: 8, color: Color.YELLOW }} />)}
                </Entity>
             )}
        </Viewer>
    </div>
  );
}

export default App;