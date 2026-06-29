import * as React from 'react';
import { ToggleGroup, ToggleGroupItem } from 'web';

export const VistaAgenda = () => (
  <ToggleGroup type="single" defaultValue="calendario">
    <ToggleGroupItem value="lista">Lista</ToggleGroupItem>
    <ToggleGroupItem value="calendario">Calendario</ToggleGroupItem>
  </ToggleGroup>
);

export const Dias = () => (
  <ToggleGroup type="multiple" defaultValue={['lun', 'mie']}>
    <ToggleGroupItem value="lun">Lun</ToggleGroupItem>
    <ToggleGroupItem value="mar">Mar</ToggleGroupItem>
    <ToggleGroupItem value="mie">Mié</ToggleGroupItem>
    <ToggleGroupItem value="jue">Jue</ToggleGroupItem>
    <ToggleGroupItem value="vie">Vie</ToggleGroupItem>
  </ToggleGroup>
);
