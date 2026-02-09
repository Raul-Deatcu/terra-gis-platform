import { useState, useEffect } from 'react';
import { 
  Paper, TextInput, NumberInput, Button, Group, Title, Stack, Text, Badge, Divider, ScrollArea, Slider
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks'; // <--- IMPORT NOU
import { IconDeviceFloppy, IconMapPinFilled, IconEdit } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface Layer {
    id: number;
    name: string;
    type: 'POINT' | 'LINE' | 'POLYGON'| 'COMMENT' | 'MODEL';
    style_props: { color: string; width?: number; extrudedHeight?: number; pixelSize?: number };
    columns: { name: string; type: string }[]; 
}

export interface Asset {
  id: number;
  name: string;
  asset_type: 'POINT' | 'POLYGON' | 'LINE' | 'COMMENT' | 'MODEL';
  position_data: any;
  style_props: any;
  properties: Record<string, string>;
  group_id?: string | null;
}

interface AssetEditorProps {
  asset: Asset;
  layer: Layer;
  isNew: boolean;
  onSave: (asset: Asset) => void;
  onDelete: (id: number) => void;
  onCancel: () => void;
  onStartRelocate: () => void;
  onStartVertexEdit?: () => void;
  onLiveUpdate?: (asset: Asset) => void; // <--- ADĂUGAT: Funcție pentru update în timp real
}

export function AssetEditor({ asset, layer, isNew, onSave, onDelete, onCancel, onStartRelocate, onStartVertexEdit, onLiveUpdate }: AssetEditorProps) {
  const [formData, setFormData] = useState<Asset | null>(null);
  const { t } = useTranslation();
  
  // HOOK PENTRU TABLETA (Detecteaza ecrane mai mici de 1024px)
  const isTablet = useMediaQuery('(max-width: 1024px)');

  useEffect(() => {
    // ... codul existent useEffect ...
    const safeAsset = { ...asset };
    if (!safeAsset.properties) safeAsset.properties = {};
    if (layer && layer.columns) {
        layer.columns.forEach(col => {
            if (safeAsset.properties[col.name] === undefined) {
                safeAsset.properties[col.name] = (col.name === 'extrudare' || col.name === 'extrude') ? '0' : '';
            }
        });
    }
    setFormData(safeAsset);
  }, [asset, layer]);

  const handleSaveInternal = () => {
    if (!formData) return;
    onSave(formData);
  };

  // --- FUNCTIE NOUA PENTRU LIVE UPDATE ---
  // Aceasta functie actualizeaza starea locala DAR trimite si modificarea catre App.tsx instant
  const updateProperty = (key: string, value: string) => {
      if (!formData) return;
      const newProps = { ...formData.properties, [key]: value };
      const updatedAsset = { ...formData, properties: newProps };
      
      setFormData(updatedAsset);
      
      // Aici apelam functia primita din parinte (App.tsx)
      if (onLiveUpdate) onLiveUpdate(updatedAsset); 
  };

  const updateCoordinate = (key: 'longitude' | 'latitude' | 'height', value: number) => {
      // ... codul existent updateCoordinate ...
      if (!formData) return;
      let newPositionData;
      if (formData.asset_type === 'POINT') {
          newPositionData = { ...formData.position_data, [key]: value };
      } else {
          newPositionData = formData.position_data;
      }
      setFormData({ ...formData, position_data: newPositionData });
  };

if (!formData) return null;

  const isPoint = formData.asset_type === 'POINT' || formData.asset_type === 'COMMENT' || formData.asset_type === 'MODEL';
  const isModel = formData.asset_type === 'MODEL';
  const isPolygon = formData.asset_type === 'POLYGON';
  const extrusionKey = layer.columns?.find(c => c.name === 'extrude')?.name || 'extrudare';
  
  // Calculam inaltimea maxima disponibila pentru panou
  const panelMaxHeight = isTablet ? 'calc(100dvh - 90px)' : 'calc(100dvh - 120px)';

  return (
    <Paper 
      shadow="xl" p="md" 
      w={isTablet ? 260 : 340} 
      bg="dark.8" 
      style={{ 
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(11, 15, 25, 0.95)',
        maxHeight: panelMaxHeight, // Limitare inaltime panou
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <ScrollArea.Autosize mah={panelMaxHeight} type="scroll" offsetScrollbars>
          <Stack gap="xs">
            <Group justify="space-between" mb="xs">
                <div style={{ lineHeight: 1.1 }}>
                    <Title order={5} c="white">
                    {isNew ? t('editor.new_entity') : t('editor.edit_entity', { id: formData.id })}
                    </Title>
                    <Text size="xs" c="dimmed">{t('editor.layer_label', { name: layer.name })}</Text>
                </div>
                <Badge variant="outline" color={layer.style_props.color}>
                    {formData.asset_type}
                </Badge>
            </Group>
            
            <Divider my="xs" label={t('editor.geometry_section')} labelPosition="center" color="dark.4" />
            
            {isPoint ? (
                <>
                    <NumberInput
                        label={t('editor.coord_z')} decimalScale={2}
                        value={formData.position_data.height || 0}
                        onChange={(val) => updateCoordinate('height', Number(val))}
                        styles={{ input: { color: '#FDC203', fontWeight: 'bold' } }}
                        mb="xs" 
                    />
                    {onStartVertexEdit && (
                        <Button 
                            fullWidth variant="light" color="terra-orange" size="xs"
                            leftSection={<IconEdit size={16}/>}
                            onClick={onStartVertexEdit}
                        >
                            {t('editor.btn_move_vertex')}
                        </Button>
                    )}
                </>
            ) : (
                <Stack gap={6}> 
                    <Button 
                        fullWidth variant="light" color="terra-yellow" size="xs"
                        leftSection={<IconMapPinFilled size={16}/>}
                        onClick={onStartRelocate}
                        style={{ color: '#FDC203' }}
                    >
                        {t('editor.btn_move_geo')}
                    </Button>

                    {onStartVertexEdit && (
                        <Button 
                            fullWidth variant="light" color="terra-orange" size="xs"
                            leftSection={<IconEdit size={16}/>}
                            onClick={onStartVertexEdit}
                        >
                            {t('editor.btn_edit_vertices')}
                        </Button>
                    )}
                </Stack>
            )}

            {isModel && (
                 <div style={{ marginTop: 10, marginBottom: 10 }}>
                    <Divider my="xs" label="Transformări 3D" labelPosition="center" color="dark.4" />
                    
                    <Group justify="space-between" mb={2}>
                        <Text size="sm" fw={500} c="terra-orange">Scară (Scale)</Text>
                        <Text size="xs" c="dimmed">{Number(formData.properties.scale || 1).toFixed(1)}x</Text>
                    </Group>
                    <Slider 
                        min={0.1} max={20} step={0.1} color="terra-orange"
                        value={Number(formData.properties.scale || 1)}
                        onChange={(val) => setFormData({
                            ...formData, 
                            properties: { ...formData.properties, scale: String(val) }
                        })}
                        mb="xs"
                    />

                    <Group justify="space-between" mb={2}>
                        <Text size="sm" fw={500} c="terra-blue">Rotire (Heading)</Text>
                        <Text size="xs" c="dimmed">{Number(formData.properties.heading || 0).toFixed(0)}°</Text>
                    </Group>
                    <Slider 
                        min={0} max={360} step={1} color="terra-blue"
                        value={Number(formData.properties.heading || 0)}
                        onChange={(val) => setFormData({
                            ...formData, 
                            properties: { ...formData.properties, heading: String(val) }
                        })}
                        mb="xs"
                    />

                    <Group justify="space-between" mb={2}>
                        <Text size="sm" fw={500} c="gray.5">Înclinare (Pitch)</Text>
                        <Text size="xs" c="dimmed">{Number(formData.properties.pitch || 0).toFixed(0)}°</Text>
                    </Group>
                    <Slider 
                        min={-90} max={90} step={1} color="gray" size="sm"
                        value={Number(formData.properties.pitch || 0)}
                        onChange={(val) => setFormData({
                            ...formData, 
                            properties: { ...formData.properties, pitch: String(val) }
                        })}
                        mb="xs"
                    />
                 </div>
            )}

            {isPolygon && (
                 <div style={{ marginTop: 10 }}>
                    <Group justify="space-between">
                        <Text size="sm" fw={500} c="terra-orange">{t('editor.extrusion_label')}</Text>
                        <Text size="xs" c="dimmed">{formData.properties[extrusionKey] || 0} {t('editor.unit_meters')}</Text>
                    </Group>
                    <Slider 
                        min={0} max={300} color="terra-orange"
                        value={Number(formData.properties[extrusionKey] || 0)}
                        onChange={(val) => setFormData({
                            ...formData, 
                            properties: { ...formData.properties, [extrusionKey]: String(val) }
                        })}
                        mb="xs" mt={4}
                    />
                 </div>
            )}

            <Divider my="xs" label={t('editor.attributes_section')} labelPosition="center" color="dark.4" />

            <Stack gap={8}>
                <TextInput
                    label={t('editor.name_label')}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />

                {layer.columns && layer.columns.length > 0 ? (
                    layer.columns.map((col, index) => {
                        if (isPolygon && col.name === extrusionKey) return null;

                        return (
                            <TextInput
                                key={index}
                                label={col.name}
                                placeholder={`...`}
                                value={formData.properties[col.name] || ''}
                                onChange={(e) => {
                                    const newProps = { ...formData.properties, [col.name]: e.target.value };
                                    setFormData({ ...formData, properties: newProps });
                                }}
                            />
                        )
                    })
                ) : (
                    <Text size="xs" c="dimmed" ta="center">{t('table.no_cols')}</Text>
                )}
            </Stack>

            <Divider my="md" />

            <Group justify="space-between">
                {!isNew ? (
                    <Button color="red" variant="subtle" size="xs" onClick={() => onDelete(formData.id)}>{t('common.delete')}</Button>
                ) : <div></div>}

                <Group gap="xs">
                    <Button variant="default" size="xs" onClick={onCancel}>{t('common.cancel')}</Button>
                    <Button 
                        color="terra-blue" size="xs" leftSection={<IconDeviceFloppy size={16}/>}
                        onClick={handleSaveInternal}
                    >
                        {isNew ? t('common.create') : t('common.save')}
                    </Button>
                </Group>
            </Group>
            {/* Spatiu gol la final pentru scroll */}
            <div style={{ minHeight: 20 }}></div>
          </Stack>
      </ScrollArea.Autosize>
    </Paper>
  );
}