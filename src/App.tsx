import { useEffect, useState, useRef, Fragment } from 'react';
import { Viewer, Entity, useCesium, Cesium3DTileset, PolylineGraphics, CameraFlyTo, type CesiumComponentRef } from 'resium';
import { 
  Cartesian3, Color, ScreenSpaceEventType, Cartographic, 
  Math as CesiumMath, ScreenSpaceEventHandler, IonResource,
  Viewer as CesiumViewer, ClassificationType, createWorldTerrainAsync,
  TerrainProvider, defined, CallbackProperty, CallbackPositionProperty, PolygonHierarchy, 
  BoundingSphere, HeadingPitchRange, 
  ColorMaterialProperty, ConstantProperty,
  Plane, Ray, IntersectionTests, Cartesian2, VerticalOrigin, HeightReference
} from 'cesium';
import { 
  Group, Text, LoadingOverlay, Button, Badge, 
  Paper, Stack, ThemeIcon, ScrollArea, Box, Divider, ActionIcon,
  Modal, TextInput, Table, Select, Popover, ColorInput, NumberInput, SegmentedControl
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks'; // <--- IMPORT NOU
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { 
    IconMapPin, IconPolygon, IconRoute, IconPlus, IconTrash, 
    IconLayersIntersect, IconTable, IconEye, IconEyeOff, IconX, IconColumns3, IconSettings, IconHandStop, IconDeviceFloppy, IconMagnet, IconEdit,
    IconDownload, IconUpload, IconGripVertical, IconMessageCircle, IconMessageExclamation
} from '@tabler/icons-react';
import { supabase } from './supabaseClient';
import { AssetEditor, type Asset } from './AssetEditor';
import { useTranslation } from 'react-i18next';

// --- DEFINIȚII TYPE ---
interface LayerColumn { name: string; type: string; }
interface Layer {
    id: number;
    name: string;
    type: 'POINT' | 'LINE' | 'POLYGON' | 'COMMENT';
    style_props: { 
        color: string; 
        width?: number; 
        extrudedHeight?: number; 
        pixelSize?: number;
        visType?: 'single' | 'unique';
        visColumn?: string;
        visColorMap?: Record<string, string>; 
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

// Actualizam constanta pentru a fi sigur ca folosim exact HEX-urile brandului in Cesium
const COLORS = {
    blue: '#0369A9', 
    orange: '#EA5906', 
    yellow: '#FDC203', 
    cyan: '#06b6d4',
    darkGlass: 'rgba(11, 15, 25, 0.90)', 
    glassBorder: 'rgba(255, 255, 255, 0.1)' 
};

// --- CONSTANTA SVG PIN (Chat Icon cu Glow) ---
const COMMENT_PIN_SVG = "data:image/svg+xml;base64," + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="16" height="16" fill="none" stroke="#EA5906" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#glow)">
      <path d="M8 9h8" opacity="0" /> 
      <path d="M4 17l-3 3v-3" />
      <path d="M14 17h-5l-3 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3z" />
      <path d="M12 9v2" />
      <path d="M12 15h.01" />
  </g>
</svg>
`);

// --- HELPER FUNCTION: Generare culoare din text ---
const CATEGORY_PALETTE = [
    '#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', 
    '#42D4F4', '#F032E6', '#BFEF45', '#FABEBE', '#469990', '#DCBEFF'
];

const getColorForValue = (val: string) => {
    if (!val) return Color.GRAY; 
    let hash = 0;
    const str = String(val);
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % CATEGORY_PALETTE.length;
    return Color.fromCssColorString(CATEGORY_PALETTE[index]);
};

// --- COMPONENTA MAP EVENTS (HOVER STABIL + FIX EXTRUDE + VERTEX EDIT) ---
interface MapEventsProps {
    drawActive: boolean;
    relocateActive: boolean;
    isEditingVertices: boolean; 
    isSnappingEnabled: boolean;
    features: Feature[];
    layers: Layer[];
    selectedFeatureId: number | null;
    onLeftClick: (cartesian: Cartesian3) => void;
    onDoubleClick: () => void;
    onMouseMoveGhost: (cartesian: Cartesian3, movementPosition?: { x: number, y: number }) => void;
    onSelectionChange: (id: number | null) => void;
    onVertexSelect?: (index: number) => void; 
}

const MapEvents = ({ drawActive, relocateActive, isEditingVertices, isSnappingEnabled, features, layers, selectedFeatureId, onLeftClick, onDoubleClick, onMouseMoveGhost, onSelectionChange, onVertexSelect }: MapEventsProps) => {
  const { viewer } = useCesium();
  
  const hoveredEntityRef = useRef<{ entity: any, originalColor: any, originalOutline?: any, originalSize?: any } | null>(null);
  const selectedEntityRef = useRef<{ entity: any, originalColor: any, originalOutline?: any } | null>(null);

  useEffect(() => {
      if (viewer && !viewer.isDestroyed()) {
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
  const highlightEntity = (entity: any, isHover: boolean) => {
      if (!viewer || viewer.isDestroyed()) return;

      const targetColor = isHover ? Color.CYAN : Color.WHITE;
      const targetOutline = isHover ? Color.WHITE : Color.BLACK;
      const targetAlpha = isHover ? 0.7 : 0.9; 

      if (entity.point) {
          entity.point.color = new ConstantProperty(targetColor);
          entity.point.pixelSize = new ConstantProperty(isHover ? 20 : 20);
          entity.point.outlineColor = new ConstantProperty(targetOutline);
          entity.point.outlineWidth = new ConstantProperty(isHover ? 2 : 4);
      } else if (entity.polyline) {
          entity.polyline.material = new ColorMaterialProperty(targetColor);
          entity.polyline.width = new ConstantProperty(isHover ? 8 : 8);
      } else if (entity.polygon) {
          entity.polygon.material = new ColorMaterialProperty(targetColor.withAlpha(targetAlpha));
          entity.polygon.outlineColor = new ConstantProperty(targetOutline);
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
      } catch (e) { }
  };

  // --- EVENT LISTENERS ---
  useEffect(() => {
    if (!viewer || !viewer.scene) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    
    // CLICK
    handler.setInputAction((movement: any) => {
      const pickedObject = viewer.scene.pick(movement.position);

      if (defined(pickedObject) && pickedObject.id && pickedObject.id.id && typeof pickedObject.id.id === 'string' && pickedObject.id.id.startsWith('vertex_handle_')) {
          const idx = parseInt(pickedObject.id.id.split('_')[2]);
          if (onVertexSelect) onVertexSelect(idx); 
          return; 
      }

      if (!drawActive && !relocateActive && !isEditingVertices) {
          if (defined(pickedObject) && pickedObject.id) {
              const entityId = pickedObject.id.id || pickedObject.id; 
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
      if (pickedPosition) {
          onLeftClick(pickedPosition);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    // DOUBLE CLICK
    handler.setInputAction(() => {
        if (drawActive) onDoubleClick();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // MOUSE MOVE
    handler.setInputAction((movement: any) => {
        // A. HOVER
        if (!drawActive && !relocateActive && !isEditingVertices) {
            const pickedObject = viewer.scene.pick(movement.endPosition);
            
            if (defined(pickedObject) && pickedObject.id) {
                const entity = pickedObject.id;
                
                if (hoveredEntityRef.current?.entity === entity) {
                    return; 
                }

                if (hoveredEntityRef.current) {
                    restoreEntityVisuals(hoveredEntityRef.current);
                    hoveredEntityRef.current = null;
                }

                const entityId = entity.id;
                const isOurFeature = typeof entityId === 'string' && !isNaN(parseInt(entityId)) && !entityId.startsWith('vertex_');
                
                if (isOurFeature && entity !== selectedEntityRef.current?.entity) {
                    let originalColor, originalOutline, originalSize;
                    if (entity.point) { originalColor = entity.point.color; originalSize = entity.point.pixelSize; }
                    else if (entity.polyline) { originalColor = entity.polyline.material; originalSize = entity.polyline.width; }
                    else if (entity.polygon) { originalColor = entity.polygon.material; originalOutline = entity.polygon.outlineColor; }
                    
                    hoveredEntityRef.current = { entity, originalColor, originalOutline, originalSize };
                    highlightEntity(entity, true); 
                    viewer.canvas.style.cursor = 'pointer';
                }
            } else {
                if (hoveredEntityRef.current) {
                    restoreEntityVisuals(hoveredEntityRef.current);
                    hoveredEntityRef.current = null;
                    viewer.canvas.style.cursor = 'default';
                }
            }
        } else {
            if (hoveredEntityRef.current) {
                restoreEntityVisuals(hoveredEntityRef.current);
                hoveredEntityRef.current = null;
            }
            viewer.canvas.style.cursor = (relocateActive || isEditingVertices) ? (isSnappingEnabled ? 'copy' : 'grabbing') : 'crosshair';
        }

        // B. GHOST & SNAP
        if (relocateActive || isEditingVertices) {
            const picked3D = viewer.scene.pickPosition(movement.endPosition);
            
            let targetPos = picked3D; 

            if (defined(targetPos) && isSnappingEnabled) {
                const snapped = calculateSnap(targetPos);
                if (snapped) targetPos = snapped;
            }

            if (relocateActive && targetPos) {
                onMouseMoveGhost(targetPos, movement.endPosition);
            } 
            else if (isEditingVertices) {
                onMouseMoveGhost(targetPos || new Cartesian3(), movement.endPosition);
            }
        }

    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => { if (!handler.isDestroyed()) handler.destroy(); };
  }, [viewer, drawActive, relocateActive, isEditingVertices, isSnappingEnabled, onLeftClick, onDoubleClick, onMouseMoveGhost, onSelectionChange, features, layers]);
  
  useEffect(() => {
      if (!viewer) return;
      
      if (hoveredEntityRef.current) {
          restoreEntityVisuals(hoveredEntityRef.current);
          hoveredEntityRef.current = null;
      }

      if (selectedEntityRef.current) {
          restoreEntityVisuals(selectedEntityRef.current);
          selectedEntityRef.current = null;
      }

      if (selectedFeatureId) {
          const entity = viewer.entities.getById(selectedFeatureId.toString());
          if (entity) {
              let originalColor, originalOutline;
              if (entity.point) originalColor = entity.point.color;
              else if (entity.polyline) originalColor = entity.polyline.material;
              else if (entity.polygon) { originalColor = entity.polygon.material; originalOutline = entity.polygon.outlineColor; }
              
              selectedEntityRef.current = { entity, originalColor, originalOutline };
              highlightEntity(entity, false); 
          }
      }
  }, [selectedFeatureId, viewer, features]);

  return null;
}


function App() {
  // HOOK RESPONSIVE
  const isTablet = useMediaQuery('(max-width: 1024px)');
  
  const [layers, setLayers] = useState<Layer[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeLayerId, setActiveLayerId] = useState<number | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(false); 
  const [tempPoints, setTempPoints] = useState<Cartesian3[]>([]);

  // --- STATE-URI NOI EDITARE VERTEXI ---
  const [isEditingVertices, setIsEditingVertices] = useState(false);
  const [activeVertexIndex, setActiveVertexIndex] = useState<number | null>(null);

  const ghostPositionRef = useRef<any>(null); 
  const dragPlaneRef = useRef<Plane | null>(null); 

  const [showNewLayerModal, setShowNewLayerModal] = useState(false);
  const [tempLayerSettings, setTempLayerSettings] = useState<Layer | null>(null); 
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState<string | null>('POINT');
  const [openAttributeTableId, setOpenAttributeTableId] = useState<number | null>(null);
  const [newColumnName, setNewColumnName] = useState('');

  const [terrainProvider, setTerrainProvider] = useState<TerrainProvider | undefined>(undefined);
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const { t, i18n } = useTranslation(); 
  
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

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
  
  const handleCategoryColorChange = async (layerId: number, category: string, newColor: string) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;

      const updatedColorMap = { ...(layer.style_props.visColorMap || {}), [category]: newColor };
      const updatedStyle = { ...layer.style_props, visColorMap: updatedColorMap };

      setLayers(layers.map(l => l.id === layerId ? { ...l, style_props: updatedStyle } : l));
      await supabase.from('layers').update({ style_props: updatedStyle }).eq('id', layerId);
  };

  const handleCreateLayer = async () => {
      if (!newLayerName || !newLayerType) return;
      setLoading(true);
      
      const defaultStyle = newLayerType === 'POINT' ? { color: COLORS.orange, pixelSize: 15 } 
          : newLayerType === 'LINE' ? { color: COLORS.cyan, width: 5 } 
          : newLayerType === 'POLYGON' ? { color: COLORS.blue, extrudedHeight: 0 }
          : { color: '#FF0000' }; 
      
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
      if (!confirm(t('alerts.confirm_delete_layer'))) return; // TRADUCERE
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
      if (layer.columns.some(c => c.name === newColumnName)) return alert(t('alerts.col_exists')); // TRADUCERE
      const updatedColumns = [...layer.columns, { name: newColumnName, type: 'text' }];
      setLoading(true);
      await supabase.from('layers').update({ columns: updatedColumns }).eq('id', layerId);
      setLayers(layers.map(l => l.id === layerId ? { ...l, columns: updatedColumns } : l));
      setNewColumnName(''); setLoading(false);
  };
  const deleteColumnFromLayer = async (layerId: number, colName: string) => {
      if (colName === 'extrudare') return alert(t('alerts.delete_col_restricted')); // TRADUCERE
      if (!confirm(t('alerts.confirm_delete_col', { colName }))) return; // TRADUCERE
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
      if(!confirm(t('alerts.confirm_delete_feature'))) return; // TRADUCERE
      await supabase.from('features').delete().eq('id', id);
      setFeatures(features.filter(f => f.id !== id));
      setSelectedFeatureId(null);
  };

  // --- HELPER 1: Logică pentru Relocare (Mutare totală) ---
  const updateGhostForRelocation = (targetPosition: Cartesian3, feature: any, layer: any) => {
      if (layer.type === 'POINT') {
          ghostPositionRef.current = targetPosition;
      } else {
          const oldFirstPoint = (feature.position_data as any[])[0];
          const cOldStart = Cartesian3.fromDegrees(oldFirstPoint.longitude, oldFirstPoint.latitude, oldFirstPoint.height);
          const delta = Cartesian3.subtract(targetPosition, cOldStart, new Cartesian3());
          
          ghostPositionRef.current = (feature.position_data as any[]).map((p: any) => {
              const pCart = Cartesian3.fromDegrees(p.longitude, p.latitude, p.height);
              return Cartesian3.add(pCart, delta, new Cartesian3());
          });
      }
  };

  // --- HELPER 2: Logică PURĂ 3D pentru Editare Vertex (Fix TypeScript Error) ---
  const updateGhostForVertex = (movementPosition: { x: number, y: number }, feature: any) => {
      // 1. Validări de bază
      if (!viewerRef.current?.cesiumElement || activeVertexIndex === null) return;
      
      const viewer = viewerRef.current.cesiumElement;
      const cart2 = new Cartesian2(movementPosition.x, movementPosition.y);

      // 2. Încercăm să luăm poziția de pe obiecte 3D
      let newPos: Cartesian3 | undefined = viewer.scene.pickPosition(cart2);

      // 3. Fallback: Raycasting pe glob
      if (!defined(newPos)) {
             const ray = viewer.camera.getPickRay(cart2);
             if (ray) {
                 newPos = viewer.scene.globe.pick(ray, viewer.scene);
             }
      }

      // 4. Aplicăm poziția
      if (defined(newPos) && newPos) {
          let originalPositions: Cartesian3[] = [];
          
          if (Array.isArray(feature.position_data)) {
              originalPositions = feature.position_data.map((p: any) => 
                  Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)
              );
          } else {
              const p = feature.position_data;
              originalPositions = [Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)];
          }
          
          const newPositions = [...originalPositions];
          newPositions[activeVertexIndex] = newPos; 
          
          ghostPositionRef.current = newPositions;
      }
  };

  const handleMouseMoveGhost = (cartesian: Cartesian3, movementPosition?: { x: number, y: number }) => {
      // 1. Guard Clauses (Validări rapide)
      if ((!isRelocating && !isEditingVertices) || !selectedFeatureId) return;
      
      const feature = features.find(f => f.id === selectedFeatureId);
      const layer = layers.find(l => l.id === feature?.layer_id);
      
      if (!feature || !layer) return;

      // 2. Ramificare Logică
      if (isRelocating) {
          updateGhostForRelocation(cartesian, feature, layer);
      } 
      else if (isEditingVertices && movementPosition) {
          updateGhostForVertex(movementPosition, feature);
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

  // --- FIX PENTRU PUNCTE (Rezolvă DeveloperError) ---
  const ghostPointPosition = new CallbackPositionProperty(() => {
      const pos = ghostPositionRef.current;
      if (Array.isArray(pos) && pos.length > 0) {
          return pos[0];
      }
      return pos;
  }, false);
  const ghostShapePositions = new CallbackProperty(() => ghostPositionRef.current || [], false);
  const ghostPolygonHierarchy = new CallbackProperty(() => new PolygonHierarchy(ghostPositionRef.current || []), false);

  const handleMapClick = (cartesian: Cartesian3) => {
      // 1. Confirmare Relocare
      if (isRelocating && selectedFeatureId) {
          const finalPos = ghostPositionRef.current;
          if(finalPos) confirmGeometryUpdate(selectedFeatureId, finalPos);
          return;
      }
      // 2. Confirmare Editare Vertex
      if (isEditingVertices && activeVertexIndex !== null && selectedFeatureId) {
          const finalPos = ghostPositionRef.current;
          if (finalPos) {
              confirmGeometryUpdate(selectedFeatureId, finalPos);
              setActiveVertexIndex(null); 
          }
          return;
      }

      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (!isDrawing || !activeLayer) return;

      if (activeLayer.type === 'POINT' || activeLayer.type === 'COMMENT') {
          saveNewFeature(activeLayer, [cartesian]);
      } else {
          setTempPoints([...tempPoints, cartesian]);
      }
  };

  const confirmGeometryUpdate = async (featureId: number, rawPosData: any) => {
      const feature = features.find(f => f.id === featureId);
      const layer = layers.find(l => l.id === feature?.layer_id);
      if (!feature || !layer) return;
      
      setLoading(true);
      let newPosDataDb: any;

      if (layer.type === 'POINT' || layer.type === 'COMMENT') {
          let singlePos = rawPosData;
          if (Array.isArray(rawPosData)) {
              singlePos = rawPosData[0];
          }
          
          const c = Cartographic.fromCartesian(singlePos as Cartesian3);
          newPosDataDb = { 
              longitude: CesiumMath.toDegrees(c.longitude), 
              latitude: CesiumMath.toDegrees(c.latitude), 
              height: c.height 
          };
      } 
      else if (Array.isArray(rawPosData)) {
          newPosDataDb = (rawPosData as Cartesian3[]).map((p: Cartesian3) => {
              const c = Cartographic.fromCartesian(p);
              return { 
                  longitude: CesiumMath.toDegrees(c.longitude), 
                  latitude: CesiumMath.toDegrees(c.latitude), 
                  height: c.height 
              };
          });
      }

      await supabase.from('features').update({ position_data: newPosDataDb }).eq('id', featureId);
      setFeatures(features.map(f => f.id === featureId ? { ...f, position_data: newPosDataDb } : f));
      
      setIsRelocating(false); 
      ghostPositionRef.current = null; 
      setLoading(false);
  };

  const handleMapDoubleClick = () => {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      
      if (!isDrawing || !activeLayer || activeLayer.type === 'POINT' || activeLayer.type === 'COMMENT') return;
      
      if (tempPoints.length < 2) return alert(t('alerts.too_few_points')); // TRADUCERE
      saveNewFeature(activeLayer, tempPoints);
  };

  const saveNewFeature = async (layer: Layer, positions: Cartesian3[]) => {
      setLoading(true);
      
      const isSinglePoint = layer.type === 'POINT' || layer.type === 'COMMENT';

      const coords = isSinglePoint
        ? { 
            longitude: CesiumMath.toDegrees(Cartographic.fromCartesian(positions[0]).longitude), 
            latitude: CesiumMath.toDegrees(Cartographic.fromCartesian(positions[0]).latitude), 
            height: Cartographic.fromCartesian(positions[0]).height 
          } 
        : positions.map(p => ({ 
            longitude: CesiumMath.toDegrees(Cartographic.fromCartesian(p).longitude), 
            latitude: CesiumMath.toDegrees(Cartographic.fromCartesian(p).latitude), 
            height: Cartographic.fromCartesian(p).height 
        }));

      const initialProps: Record<string, string> = {};
      layer.columns.forEach(col => { if (col.name === 'extrudare') initialProps[col.name] = '0'; else initialProps[col.name] = ""; });
      
      const { data } = await supabase.from('features').insert([{ layer_id: layer.id, position_data: coords, properties: { ...initialProps, name: `New ${layer.type}` } }]).select();
      if (data) setFeatures([...features, data[0]]);
      setIsDrawing(false); setTempPoints([]); setLoading(false);
  };

  const glassPanelStyle = { backgroundColor: COLORS.darkGlass, backdropFilter: 'blur(16px)', border: `1px solid ${COLORS.glassBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', color: 'white' };
  const activeTableLayer = layers.find(l => l.id === openAttributeTableId);
  const activeTableFeatures = features.filter(f => f.layer_id === openAttributeTableId);

  // --- FUNCȚIE EXPORT GEOJSON ---
  const handleExportLayer = (layer: Layer) => {
      const layerFeatures = features.filter(f => f.layer_id === layer.id);
      
      const geoJsonFeatures = layerFeatures.map(f => {
          let geometry: any;
          const pos = f.position_data;

          if (layer.type === 'POINT') {
              geometry = {
                  type: "Point",
                  coordinates: [pos.longitude, pos.latitude, pos.height || 0]
              };
          } else if (layer.type === 'LINE') {
              geometry = {
                  type: "LineString",
                  coordinates: (pos as any[]).map(p => [p.longitude, p.latitude, p.height || 0])
              };
          } else if (layer.type === 'POLYGON') {
              const coords = (pos as any[]).map(p => [p.longitude, p.latitude, p.height || 0]);
              if (coords.length > 0) {
                   const first = coords[0];
                   const last = coords[coords.length - 1];
                   if (first[0] !== last[0] || first[1] !== last[1]) {
                       coords.push(first); 
                   }
              }
              geometry = {
                  type: "Polygon",
                  coordinates: [coords]
              };
          }

          return {
              type: "Feature",
              geometry: geometry,
              properties: f.properties
          };
      });

      const featureCollection = {
          type: "FeatureCollection",
          name: layer.name,
          features: geoJsonFeatures
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(featureCollection));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${layer.name}.geojson`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  // --- FUNCȚIE IMPORT GEOJSON (CORECATĂ PENTRU SQL SUPABASE) ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const inputElement = event.target;
      
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result;
              if (typeof text !== 'string') return;
              
              const geoJson = JSON.parse(text);
              if (!geoJson.features || !Array.isArray(geoJson.features)) {
                  throw new Error(t('alerts.format_error')); // TRADUCERE
              }

              setLoading(true);

              const firstFeature = geoJson.features.find((f: any) => f.geometry);
              if (!firstFeature) throw new Error(t('alerts.no_geo_error')); // TRADUCERE

              const firstType = firstFeature.geometry.type;
              let layerType: 'POINT' | 'LINE' | 'POLYGON' = 'POINT';
              
              if (firstType === 'Point' || firstType === 'MultiPoint') layerType = 'POINT';
              else if (firstType === 'LineString' || firstType === 'MultiLineString') layerType = 'LINE';
              else if (firstType === 'Polygon' || firstType === 'MultiPolygon') layerType = 'POLYGON';
              else {
                  throw new Error(t('alerts.type_error', { type: firstType })); // TRADUCERE
              }

              const allKeys = new Set<string>();
              geoJson.features.forEach((f: any) => {
                  if (f.properties) Object.keys(f.properties).forEach(k => allKeys.add(k));
              });
              allKeys.add('name');
              
              const columns = Array.from(allKeys).map(k => ({ name: k, type: 'text' }));
              if (layerType === 'POLYGON' && !allKeys.has('extrudare')) {
                  columns.push({ name: 'extrudare', type: 'number' });
              }

              const timeSuffix = new Date().toLocaleTimeString('ro-RO').replace(/:/g, '');
              const baseName = file.name.replace(/\.(geojson|json)$/i, '');
              const layerName = `${baseName} (Import ${timeSuffix})`;

              const defaultStyle = layerType === 'POINT' ? { color: COLORS.orange, pixelSize: 15 } 
                  : layerType === 'LINE' ? { color: COLORS.cyan, width: 5 } 
                  : { color: COLORS.blue, extrudedHeight: 0 };

              const { data: layerData, error: layerError } = await supabase
                  .from('layers')
                  .insert([{ 
                      name: layerName, 
                      type: layerType, 
                      style_props: defaultStyle, 
                      visible: true, 
                      columns: columns 
                  }])
                  .select();

              if (layerError) throw new Error(t('alerts.db_layer_error', { message: layerError.message })); // TRADUCERE
              if (!layerData) throw new Error(t('alerts.layer_create_error')); // TRADUCERE
              
              const newLayerId = layerData[0].id;

              const featuresToInsert = geoJson.features.map((f: any) => {
                  const props = f.properties || {};
                  
                  if (!props.name) {
                      props.name = f.id || `Feature ${layerType}`;
                  }
                  
                  if (layerType === 'POLYGON' && !props.extrudare) {
                      props.extrudare = '0';
                  }

                  let posData: any = null;
                  const coords = f.geometry.coordinates;

                  if (layerType === 'POINT') {
                      const pt = (f.geometry.type === 'MultiPoint') ? coords[0] : coords;
                      posData = { longitude: Number(pt[0]), latitude: Number(pt[1]), height: Number(pt[2] || 0) };
                  } 
                  else if (layerType === 'LINE') {
                      const lineCoords = (f.geometry.type === 'MultiLineString') ? coords[0] : coords;
                      posData = lineCoords.map((c: any) => ({ 
                          longitude: Number(c[0]), latitude: Number(c[1]), height: Number(c[2] || 0) 
                      }));
                  } 
                  else if (layerType === 'POLYGON') {
                      const ring = (f.geometry.type === 'MultiPolygon') ? coords[0][0] : coords[0];
                      posData = ring.map((c: any) => ({ 
                          longitude: Number(c[0]), latitude: Number(c[1]), height: Number(c[2] || 0) 
                      }));
                  }

                  return {
                      layer_id: newLayerId,
                      position_data: posData,
                      properties: props 
                  };
              });

              const validFeatures = featuresToInsert.filter((f: any) => f.position_data !== null);

              if (validFeatures.length === 0) {
                   throw new Error(t('alerts.coords_error')); // TRADUCERE
              }

              const { error: featuresError } = await supabase
                  .from('features')
                  .insert(validFeatures);
              
              if (featuresError) throw new Error(t('alerts.db_feature_error', { message: featuresError.message })); // TRADUCERE

              fetchData();
              alert(t('alerts.import_success', { count: validFeatures.length, layerName })); // TRADUCERE

          } catch (err: any) {
              console.error("Import failed:", err);
              alert(t('alerts.import_error', { message: err.message })); // TRADUCERE
          } finally {
              setLoading(false);
              inputElement.value = ''; 
          }
      };
      reader.readAsText(file);
  };

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(layers);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setLayers(items);
  };

return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000', cursor: (isRelocating || isEditingVertices) ? (isSnappingEnabled ? 'copy' : 'grabbing') : 'default' }}>
        
        {/* HEADER STÂNGA: LOGO + TITLU */}
        {/* Ajustare: Pe tableta e mai ingust si mai aproape de margine */}
        <Paper 
            style={{ 
                ...glassPanelStyle, 
                position: 'absolute', 
                top: isTablet ? 10 : 20, 
                left: isTablet ? 10 : 20, 
                zIndex: 10, 
                borderLeft: `3px solid ${COLORS.blue}`, 
                width: isTablet ? 'auto' : 300,
                minWidth: isTablet ? 200 : 300 
            }} 
            p="xs" radius="sm"
        >
            <Group gap={10}>
                <ThemeIcon size="lg" variant="filled" color="terra-blue" radius="sm">
                    <IconLayersIntersect size={20} />
                </ThemeIcon>
                <div style={{ lineHeight: 1.1 }}>
                    <Text fw={900} size={isTablet ? "md" : "lg"} style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                        TERRA<span style={{ color: COLORS.yellow }}>ASSET</span>
                    </Text>
                    {/* Ascundem subtitlul pe tableta pentru a economisi spatiu */}
                    {!isTablet && <Text size="xs" c="dimmed">{t('header.subtitle')}</Text>}
                </div>
            </Group>
        </Paper>

        {/* HEADER DREAPTA: SELECTOR LIMBĂ */}
        <Paper 
            style={{ 
                ...glassPanelStyle, 
                position: 'absolute', 
                top: isTablet ? 10 : 20, 
                right: isTablet ? 10 : 20, 
                zIndex: 10 
            }} 
            p={4} radius="sm"
        >
            <SegmentedControl 
                size="xs"
                data={[
                    { label: 'EN', value: 'en' },
                    { label: 'DE', value: 'de' },
                    { label: 'RO', value: 'ro' }
                ]}
                value={i18n.language}
                onChange={changeLanguage}
                styles={{ 
                    root: { backgroundColor: 'transparent' }, 
                    label: { color: 'white', fontWeight: 600 },
                    control: { border: 'none' }
                }}
            />
        </Paper>

        {/* LAYER MANAGER */}
        <Paper 
            style={{ 
                ...glassPanelStyle, 
                position: 'absolute', 
                top: isTablet ? 70 : 90, // Mai sus pe tableta
                left: isTablet ? 10 : 20, 
                bottom: openAttributeTableId ? '40%' : (isTablet ? 20 : 30), // Bottom dinamic
                width: isTablet ? 240 : 300, // Mai ingust pe tableta
                zIndex: 10, 
                display: 'flex', 
                flexDirection: 'column' 
            }} 
            radius="sm"
        >
            {/* ... CONTINUTUL LAYER MANAGER RAMANE NESCHIMBAT (COPIAZA DE MAI JOS) ... */}
            <Box p="sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Group justify="space-between" mb="xs">
                    <Text size="xs" fw={700} c="dimmed">{t('layers.title')} ({layers.length})</Text> 
                    <Group gap={5}>
                        <input type="file" accept=".geojson,.json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                        <Button size="compact-xs" color="terra-orange" variant="light" leftSection={<IconUpload size={14}/>} onClick={() => fileInputRef.current?.click()}>{t('common.import')}</Button>
                        <Button size="compact-xs" color="terra-blue" variant="filled" leftSection={<IconPlus size={14}/>} onClick={() => setShowNewLayerModal(true)}>{t('layers.new_layer_btn')}</Button>
                    </Group>
                </Group>
            </Box>
            <ScrollArea style={{ flex: 1 }} p="xs">
                <DragDropContext onDragEnd={handleOnDragEnd}>
                    <Droppable droppableId="layers">
                        {(provided) => (
                            <Stack gap={8} {...provided.droppableProps} ref={provided.innerRef}>
                                {layers.map((layer, index) => {
                                    const isActive = activeLayerId === layer.id;
                                    return (
                                        <Draggable key={layer.id} draggableId={layer.id.toString()} index={index}>
                                            {(provided) => (
                                                <div ref={provided.innerRef} {...provided.draggableProps}>
                                                    <Paper p="xs" radius="sm" style={{ backgroundColor: isActive ? 'rgba(3, 105, 169, 0.2)' : 'rgba(255,255,255,0.03)', border: isActive ? `1px solid ${COLORS.blue}` : '1px solid transparent', cursor: 'pointer' }} onClick={() => { setActiveLayerId(layer.id); setIsDrawing(false); }}>
                                                        <Group justify="space-between" mb={4}>
                                                            <Group gap={8}>
                                                                <div {...provided.dragHandleProps} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }}><IconGripVertical size={16} color="gray" style={{ opacity: 0.5 }} /></div>
                                                                {layer.type === 'POINT' && <IconMapPin size={16} color={COLORS.orange} style={{ opacity: 0.9 }} />}
                                                                {layer.type === 'LINE' && <IconRoute size={16} color={COLORS.blue} style={{ opacity: 0.9 }} />}
                                                                {layer.type === 'POLYGON' && <IconPolygon size={16} color={COLORS.yellow} style={{ opacity: 0.9 }} />}
                                                                {layer.type === 'COMMENT' && <IconMessageExclamation size={18} color={COLORS.orange} style={{ filter: `drop-shadow(0 0 3px ${COLORS.orange})` }} />}
                                                                <Text size="sm" fw={700} c="white" style={{ maxWidth: isTablet ? 90 : 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name}</Text>
                                                            </Group>
                                                            <Group gap={2}>
                                                                <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); handleExportLayer(layer); }}><IconDownload size={14}/></ActionIcon>
                                                                <ActionIcon size="sm" variant="subtle" color="terra-blue" onClick={(e) => { e.stopPropagation(); openLayerSettings(layer); }}><IconSettings size={14}/></ActionIcon>
                                                                <ActionIcon size="sm" variant="subtle" color={layer.visible ? 'terra-yellow' : 'gray'} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id, layer.visible); }}>{layer.visible ? <IconEye size={14}/> : <IconEyeOff size={14}/>}</ActionIcon>
                                                                <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}><IconTrash size={14}/></ActionIcon>
                                                            </Group>
                                                        </Group>
                                                        <Group justify="space-between" mb={layer.style_props.visType === 'unique' ? 8 : 0}>
                                                            <Badge size="xs" variant="filled" color="dark">{features.filter(f => f.layer_id === layer.id).length} {t('layers.entities')}</Badge> 
                                                            <Button size="compact-xs" variant="subtle" color="cyan" leftSection={<IconTable size={12}/>} onClick={(e) => { e.stopPropagation(); setOpenAttributeTableId(openAttributeTableId === layer.id ? null : layer.id); }}>{t('layers.table_btn')}</Button> 
                                                        </Group>
                                                        {layer.style_props.visType === 'unique' && layer.style_props.visColumn && (
                                                            <Box mt="xs" p="xs" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                                                                <Text size="xs" c="dimmed" mb={4}>{t('layers.legend')} ({layer.style_props.visColumn}):</Text> 
                                                                <Stack gap={6}>
                                                                    {Array.from(new Set(features.filter(f => f.layer_id === layer.id).map(f => f.properties[layer.style_props.visColumn!] || 'N/A'))).sort().map(val => {
                                                                        const savedColor = layer.style_props.visColorMap ? layer.style_props.visColorMap[val] : undefined;
                                                                        const autoColorObj = getColorForValue(val);
                                                                        const displayColorString = savedColor || autoColorObj.toCssColorString();
                                                                        return (
                                                                            <Group key={val} justify="space-between" gap={8}>
                                                                                <Text size="xs" c="white" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</Text>
                                                                                <ColorInput size="xs" format="hex" value={displayColorString} onChange={(c) => handleCategoryColorChange(layer.id, val, c)} onClick={(e) => e.stopPropagation()} styles={{ input: { width: 100, height: 26, minHeight: 26, padding: 0, paddingLeft: 30, fontSize: 11, color: 'white', backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', cursor: 'pointer'}, swatch: { width: 18, height: 18, marginLeft: 4, cursor: 'pointer' } }}/>
                                                                            </Group>
                                                                        );
                                                                    })}
                                                                </Stack>
                                                            </Box>
                                                        )}
                                                    </Paper>
                                                </div>
                                            )}
                                        </Draggable>
                                    );
                                })}
                                {provided.placeholder}
                            </Stack>
                        )}
                    </Droppable>
                </DragDropContext>
            </ScrollArea>
        </Paper>

        {/* MODALELE RAMAN LA FEL, DOAR ASIGURA-TE CA SUNT IN CODUL TAU */}
        <Modal opened={!!tempLayerSettings} onClose={() => setTempLayerSettings(null)} title={t('modals.settings_title')} centered styles={{ content: { backgroundColor: '#1A1B1E', color: 'white' }, header: { backgroundColor: '#1A1B1E', color: 'white' } }}>
             {/* ... CONTINUT MODAL SETARI (neschimbat) ... */}
             {tempLayerSettings && (<Stack>
                <TextInput label={t('modals.layer_name')} value={tempLayerSettings.name} disabled styles={{ input: { backgroundColor: '#2C2E33', color: '#999' } }}/>
                {tempLayerSettings.type === 'COMMENT' ? (<div style={{ padding: 10, backgroundColor: 'rgba(220, 38, 38, 0.15)', border: '1px solid #ef4444', borderRadius: 4 }}><Text size="sm" c="red.4" fw={500}>{t('modals.comment_warning')}</Text></div>) : (<><SegmentedControl fullWidth data={[{ label: t('modals.vis_type_single'), value: 'single' }, { label: t('modals.vis_type_unique'), value: 'unique' }]} value={tempLayerSettings.style_props.visType || 'single'} onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, visType: val as any } })} mb="xs"/>{(!tempLayerSettings.style_props.visType || tempLayerSettings.style_props.visType === 'single') ? (<ColorInput label={t('modals.color')} value={tempLayerSettings.style_props.color} onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, color: val } })} />) : (<Select label={t('modals.choose_column')} placeholder={t('modals.select_column')} data={tempLayerSettings.columns.map(c => c.name)} value={tempLayerSettings.style_props.visColumn || null} onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, visColumn: val || undefined } })}/>)}{tempLayerSettings.type !== 'POLYGON' && <NumberInput label={t('modals.size_px')} value={tempLayerSettings.type === 'POINT' ? tempLayerSettings.style_props.pixelSize : tempLayerSettings.style_props.width} onChange={(val) => { const key = tempLayerSettings.type === 'POINT' ? 'pixelSize' : 'width'; setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, [key]: Number(val) } }) }} />}{tempLayerSettings.type === 'POLYGON' && <NumberInput label={t('modals.extrusion')} value={tempLayerSettings.style_props.extrudedHeight} onChange={(val) => setTempLayerSettings({ ...tempLayerSettings, style_props: { ...tempLayerSettings.style_props, extrudedHeight: Number(val) } })} />}</>)}
                <Divider my="sm" />
                <Group justify="flex-end"><Button variant="default" onClick={() => setTempLayerSettings(null)}>{t('common.cancel')}</Button><Button color="blue" onClick={saveLayerSettings} leftSection={<IconDeviceFloppy size={16}/>}>{t('modals.save_changes')}</Button></Group>
            </Stack>)}
        </Modal>

        <Modal opened={showNewLayerModal} onClose={() => setShowNewLayerModal(false)} title={t('modals.new_layer_title')} centered styles={{ content: { backgroundColor: '#1A1B1E', color: 'white' }, header: { backgroundColor: '#1A1B1E', color: 'white' } }}>
            <Stack>
                <TextInput label={t('modals.layer_name')} value={newLayerName} onChange={(e) => setNewLayerName(e.target.value)} styles={{ input: { backgroundColor: '#2C2E33', color: 'white' } }}/>
                <Select label={t('modals.geometry_type')} data={['POINT', 'LINE', 'POLYGON', 'COMMENT']} value={newLayerType} onChange={setNewLayerType} styles={{ input: { backgroundColor: '#2C2E33', color: 'white' } }} />
                <Button fullWidth onClick={handleCreateLayer} color="blue">{t('common.create')}</Button>
            </Stack>
        </Modal>

        {/* TOOLBARS CENTRALE - Ajustate pentru tableta (urcate putin mai sus) */}
        {isRelocating && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, borderColor: isSnappingEnabled ? COLORS.cyan : COLORS.yellow, width: isTablet ? '90%' : 'auto' }} p="md" radius="sm">
                <Group justify="center">
                    <IconHandStop size={24} color={isSnappingEnabled ? COLORS.cyan : COLORS.yellow} />
                    {!isTablet && <div><Text fw={700} c="white">{t('map_tools.pos_mode')}</Text><Text size="xs" c="dimmed">{t('map_tools.pos_desc')}</Text></div>}
                    <Button size="xs" color={isSnappingEnabled ? "cyan" : "gray"} variant={isSnappingEnabled ? "filled" : "outline"} leftSection={<IconMagnet size={16} />} onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}>{isSnappingEnabled ? t('map_tools.snap_on') : t('map_tools.snap_off')}</Button>
                    <Button size="xs" color="red" variant="light" onClick={() => { setIsRelocating(false); ghostPositionRef.current = null; }}>{t('common.cancel')}</Button>
                </Group>
            </Paper>
        )}

        {isEditingVertices && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, borderColor: COLORS.orange, width: isTablet ? '90%' : 'auto' }} p="md" radius="sm">
                <Group justify="center">
                    <IconPolygon size={24} color={COLORS.orange} />
                    {!isTablet && <div><Text fw={700} c="white">{t('map_tools.vertex_mode')}</Text><Text size="xs" c="dimmed">{activeVertexIndex !== null ? t('map_tools.vertex_desc_move') : t('map_tools.vertex_desc_select')}</Text></div>}
                    <Button size="xs" color={isSnappingEnabled ? "cyan" : "gray"} variant={isSnappingEnabled ? "filled" : "outline"} leftSection={<IconMagnet size={16} />} onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}>{isSnappingEnabled ? t('map_tools.snap_on') : t('map_tools.snap_off')}</Button>
                    <Button size="xs" color="red" variant="light" onClick={() => { setIsEditingVertices(false); setActiveVertexIndex(null); ghostPositionRef.current = null; }}>{t('common.finish')}</Button>
                </Group>
            </Paper>
        )}

        {activeLayerId && !isRelocating && !isEditingVertices && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: isTablet ? 'auto' : 'auto' }} p="xs" radius="sm">
                <Group>
                    {!isTablet && <Text size="sm" c="dimmed">{t('map_tools.active_layer')}</Text>}
                    <Text size="sm" fw={700} c={COLORS.yellow}>{layers.find(l => l.id === activeLayerId)?.name}</Text>
                    <Divider orientation="vertical" />
                    {!isDrawing ? (
                        <Button color="terra-blue" size="xs" leftSection={<IconPlus size={16}/>} onClick={() => { setIsDrawing(true); setIsRelocating(false); }}>{t('common.add')} {layers.find(l => l.id === activeLayerId)?.type}</Button>
                    ) : (
                        <Button color="red" size="xs" onClick={() => { setIsDrawing(false); setTempPoints([]); }}>{t('map_tools.cancel_draw')}</Button>
                    )}
                </Group>
            </Paper>
        )}

        {/* ATTRIBUTE TABLE - Ajustat margini pentru tableta */}
        {activeTableLayer && (
            <Paper style={{ ...glassPanelStyle, position: 'absolute', bottom: 20, left: isTablet ? 10 : 20, right: isTablet ? 10 : 20, height: isTablet ? '30%' : '35%', zIndex: 20, display: 'flex', flexDirection: 'column' }} radius="sm">
               {/* CONTINUT TABEL - RAMANE IDENTIC (COPIAZA-L DIN FIXUL ANTERIOR SAU PASTRAZA-L PE CEL EXISTENT) */}
               <Box p="xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <Group justify="space-between">
                        <Group>
                            <IconTable size={18} color={COLORS.yellow} />
                            <Text fw={700} c="white">{t('table.title')} <span style={{ color: COLORS.blue }}>{activeTableLayer.name}</span></Text>
                            <Divider orientation="vertical" />
                            <Popover width={300} trapFocus position="bottom" withArrow shadow="md">
                                <Popover.Target><Button size="compact-xs" variant="light" leftSection={<IconColumns3 size={14}/>}>{t('table.manage_cols')}</Button></Popover.Target>
                                <Popover.Dropdown bg="dark.8">
                                    <Stack gap="xs">
                                        <Text size="xs" fw={700}>{t('table.add_col_title')}</Text>
                                        <Group gap={4}><TextInput size="xs" placeholder={t('table.col_name_placeholder')} value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} /><Button size="xs" onClick={() => addColumnToLayer(activeTableLayer.id)}>{t('table.add_btn')}</Button></Group>
                                        <Divider my={4}/>
                                        <Text size="xs" fw={700}>{t('table.existing_cols')}</Text>
                                        <Group gap={4} style={{flexWrap: 'wrap'}}>{activeTableLayer.columns.length === 0 && <Text size="xs" c="dimmed">{t('table.no_cols')}</Text>}{activeTableLayer.columns.map(col => (<Badge key={col.name} size="lg" variant="outline" rightSection={<ActionIcon size="xs" color="red" variant="transparent" onClick={() => deleteColumnFromLayer(activeTableLayer.id, col.name)}><IconX size={10} /></ActionIcon>}>{col.name}</Badge>))}</Group>
                                    </Stack>
                                </Popover.Dropdown>
                            </Popover>
                        </Group>
                        <ActionIcon variant="subtle" color="gray" onClick={() => setOpenAttributeTableId(null)}><IconX size={16}/></ActionIcon>
                    </Group>
                </Box>
                <ScrollArea style={{ flex: 1 }}>
                    <Table stickyHeader highlightOnHover verticalSpacing="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th style={{ color: '#aaa' }}>{t('table.headers.id')}</Table.Th>
                                <Table.Th style={{ color: '#aaa' }}>{t('table.headers.name')}</Table.Th>
                                {activeTableLayer.columns.map(col => (<Table.Th key={col.name} style={{ color: COLORS.blue }}>{col.name}</Table.Th>))}
                                <Table.Th style={{ color: '#aaa' }}>{t('table.headers.actions')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {activeTableFeatures.map(f => (
                                <Table.Tr key={f.id} style={{ cursor: 'pointer', backgroundColor: selectedFeatureId === f.id ? 'rgba(3, 105, 169, 0.2)' : 'transparent' }} onClick={() => setSelectedFeatureId(f.id)} onDoubleClick={() => zoomToFeature(f)}>
                                    <Table.Td style={{ color: 'white' }}>{f.id}</Table.Td>
                                    <Table.Td style={{ color: 'white' }}>{f.properties.name || '-'}</Table.Td>
                                    {activeTableLayer.columns.map(col => (<Table.Td key={col.name} style={{ color: 'white' }}>{f.properties[col.name] || <span style={{color:'gray', fontSize:'10px'}}>{t('table.empty_cell')}</span>}</Table.Td>))}
                                    <Table.Td><ActionIcon size="sm" color="red" variant="subtle" onClick={(e) => { e.stopPropagation(); handleDeleteFeature(f.id); }}><IconTrash size={14}/></ActionIcon></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        )}

        {/* ASSET EDITOR - Pozitionat dinamic */}
        {selectedFeatureId && (
             <div style={{ position: 'absolute', top: isTablet ? 70 : 90, right: isTablet ? 10 : 20, zIndex: 15, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                 <AssetEditor 
                    asset={featureToAsset(features.find(f => f.id === selectedFeatureId)!, layers.find(l => l.id === features.find(f => f.id === selectedFeatureId)?.layer_id)!)}
                    layer={layers.find(l => l.id === features.find(f => f.id === selectedFeatureId)?.layer_id)!}
                    isNew={false}
                    onSave={handleSaveFeatureEdit}
                    onDelete={handleDeleteFeature}
                    onCancel={() => setSelectedFeatureId(null)}
                    onStartRelocate={startRelocation}
                    onStartVertexEdit={() => setIsEditingVertices(true)}
                 />
             </div>
        )}

        {/* VIEWER CESIUM */}
        <Viewer 
            ref={viewerRef} full selectionIndicator={false} infoBox={false} timeline={false} animation={false} 
            navigationHelpButton={false} sceneModePicker={false} baseLayerPicker={false} homeButton={false} geocoder={false} fullscreenButton={false}
            terrainProvider={terrainProvider}
        >
             {/* ... RESTUL COMPONENTELOR CESIUM (Tileset, Camera, MapEvents, Entities) RAMAN IDENTICE ... */}
             <Cesium3DTileset url={IonResource.fromAssetId(2275207)} />
             <CameraFlyTo destination={Cartesian3.fromDegrees(26.056986, 44.442540, 350)} orientation={{ heading: CesiumMath.toRadians(800), pitch: CesiumMath.toRadians(-55), roll: 0.0 }} duration={0} once={true} />
             
             <MapEvents 
                drawActive={isDrawing} relocateActive={isRelocating} isEditingVertices={isEditingVertices} isSnappingEnabled={isSnappingEnabled} features={features} layers={layers} selectedFeatureId={selectedFeatureId}
                onLeftClick={handleMapClick} onDoubleClick={handleMapDoubleClick} onMouseMoveGhost={handleMouseMoveGhost} onSelectionChange={setSelectedFeatureId}
                onVertexSelect={(idx) => {
                    if (isEditingVertices) {
                        setActiveVertexIndex(idx);
                        const feature = features.find(f => f.id === selectedFeatureId);
                        if (feature) {
                             let positions: Cartesian3[] = [];
                             if (Array.isArray(feature.position_data)) {
                                 positions = feature.position_data.map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                             } else {
                                 const p = feature.position_data;
                                 positions = [Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)];
                             }
                             ghostPositionRef.current = positions;
                             const selectedPos = positions[idx];
                             const surfaceNormal = Cartesian3.normalize(selectedPos, new Cartesian3());
                             dragPlaneRef.current = Plane.fromPointNormal(selectedPos, surfaceNormal);
                        }
                    }
                }}
             />

             {layers.filter(l => l.visible).map(layer => {
                const layerFeatures = features.filter(f => f.layer_id === layer.id);
                
                return (
                    <Fragment key={layer.id}>
                        {layerFeatures.map(feature => {
                            if ((isRelocating || isEditingVertices) && feature.id === selectedFeatureId) return null;

                            const style = layer.style_props;
                            const extrusionValue = Number(feature.properties.extrude || feature.properties.extrudare) || 0;
                            const isExtruded = extrusionValue > 0;
                            const isSelected = selectedFeatureId === feature.id;

                            let baseColor;
                            if (style.visType === 'unique' && style.visColumn) {
                                const val = feature.properties[style.visColumn];
                                if (style.visColorMap && style.visColorMap[val]) {
                                    baseColor = Color.fromCssColorString(style.visColorMap[val]);
                                } else {
                                    baseColor = getColorForValue(val);
                                }
                            } else {
                                baseColor = Color.fromCssColorString(style.color);
                            }

                            const displayColor = isSelected ? Color.WHITE : baseColor;
                            const outlineColor = isSelected ? Color.BLACK : Color.WHITE;
                            const alpha = isSelected ? 0.9 : 0.6;
                            const materialColor = displayColor.withAlpha(alpha);
                            const outlineWidth = isSelected ? 3 : 1;

                            if (layer.type === 'COMMENT') {
                                const pos = Cartesian3.fromDegrees(feature.position_data.longitude, feature.position_data.latitude, feature.position_data.height);
                                return <Entity 
                                    id={feature.id.toString()}
                                    key={feature.id} 
                                    position={pos} 
                                    billboard={{
                                        image: COMMENT_PIN_SVG, 
                                        width: 40,  
                                        height: 40,
                                        verticalOrigin: VerticalOrigin.BOTTOM, 
                                        heightReference: HeightReference.RELATIVE_TO_GROUND, 
                                        pixelOffset: new Cartesian2(0, -5), 
                                        scale: isSelected ? 1.3 : 1.0, 
                                        disableDepthTestDistance: Number.POSITIVE_INFINITY, 
                                        color: Color.WHITE 
                                    }}
                                    description={feature.properties.description || "No description"}
                                />;
                            }

                            if (layer.type === 'POINT') {
                                const pos = Cartesian3.fromDegrees(feature.position_data.longitude, feature.position_data.latitude, feature.position_data.height);
                                return <Entity id={feature.id.toString()} key={feature.id} position={pos} point={{ pixelSize: style.pixelSize || 10, color: materialColor, outlineColor: outlineColor, outlineWidth: isSelected ? 2 : 0, disableDepthTestDistance: Number.POSITIVE_INFINITY }} />;
                            } 
                            else if (layer.type === 'LINE') {
                                const positions = (feature.position_data as any[]).map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                                return <Entity id={feature.id.toString()} key={feature.id} polyline={{ positions, width: style.width || 5, material: isSelected ? Color.WHITE : baseColor }} />;
                            }
                            else {
                                const hierarchy = (feature.position_data as any[]).map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                                return <Entity id={feature.id.toString()} key={feature.id} polygon={{ hierarchy, extrudedHeight: isExtruded ? (feature.position_data[0].height + extrusionValue) : undefined, perPositionHeight: isExtruded, classificationType: !isExtruded ? ClassificationType.CESIUM_3D_TILE : undefined, material: materialColor, outline: true, outlineColor: outlineColor, outlineWidth: outlineWidth }} />;
                            }
                        })}
                    </Fragment>
                );
            })}
             {/* ... GHOST ENTITIES SI HANDLE POINTS PENTRU EDITARE RAMAN IDENTICE ... */}
             {isEditingVertices && selectedFeatureId && (() => {
                 const feature = features.find(f => f.id === selectedFeatureId);
                 if (!feature || feature.layer_id === undefined) return null;
                 const layer = layers.find(l => l.id === feature.layer_id);
                 if (!layer) return null; 
                 let positions: Cartesian3[] = [];
                 if (Array.isArray(feature.position_data)) {
                    positions = feature.position_data.map((p: any) => Cartesian3.fromDegrees(p.longitude, p.latitude, p.height));
                 } else {
                    const p = feature.position_data;
                    positions = [Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)];
                 }
                 return positions.map((pos, idx) => (
                     <Entity key={`handle_${idx}`} id={`vertex_handle_${idx}`} position={pos} show={activeVertexIndex !== idx} point={{ pixelSize: activeVertexIndex === idx ? 15 : 10, color: activeVertexIndex === idx ? Color.RED : Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: undefined }} />
                 ));
             })()}

            {(isRelocating || (isEditingVertices && activeVertexIndex !== null)) && selectedFeatureId && (
                 (() => {
                     const feature = features.find(f => f.id === selectedFeatureId);
                     const layer = layers.find(l => l.id === feature?.layer_id);
                     if (!layer) return null;
                     if (layer.type === 'POINT' || layer.type === 'COMMENT') {
                         return <Entity position={ghostPointPosition} point={{ pixelSize: 10, color: layer.type === 'COMMENT' ? Color.RED : Color.CYAN.withAlpha(0.8), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }} />;
                     } else if (layer.type === 'LINE') {
                         return <Entity polyline={{ positions: ghostShapePositions, width: 6, material: Color.CYAN.withAlpha(0.8) }} />;
                     } else {
                         const extrusionValue = Number(feature?.properties.extrudare) || 0;
                         const isExtruded = extrusionValue > 0;
                         return <Entity polygon={{ hierarchy: ghostPolygonHierarchy, material: Color.CYAN.withAlpha(0.4), outline: true, outlineColor: Color.WHITE, outlineWidth: 3, extrudedHeight: isExtruded ? new CallbackProperty(() => { const pos = ghostPositionRef.current; if(!pos || !pos[0]) return undefined; const c = Cartographic.fromCartesian(pos[0]); return c.height + extrusionValue; }, false) : undefined, perPositionHeight: true, classificationType: undefined }} />;
                     }
                 })()
             )}
             {isDrawing && tempPoints.length > 0 && (<Entity><PolylineGraphics positions={tempPoints} width={2} material={Color.YELLOW} />{tempPoints.map((p, i) => <Entity key={i} position={p} point={{ pixelSize: 8, color: Color.YELLOW }} />)}</Entity>)}
        </Viewer>
    </div>
  );
}

export default App;