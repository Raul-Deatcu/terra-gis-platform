import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Ion } from 'cesium'; // <--- IMPORT NOU
import './i18n'; // <--- IMPORT NOU
import App from './App.tsx';
import '@mantine/core/styles.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './index.css';

// Definim culorile brandului custom
// NOTA: Culorile brandului (#0369A9, #EA5906, #FDC203) sunt puse la indexul 6 (primary shade)
const theme = createTheme({
  colors: {
    'terra-blue': [
      '#eef8fc', '#d8ebf4', '#afd3e6', '#83bad8', '#5ea4cd', 
      '#4696c6', '#0369A9', '#025c95', '#014f82', '#004270' // Index 6 este #0369A9
    ],
    'terra-orange': [
      '#fff0e4', '#ffe0cf', '#ffc0a1', '#ff9f6f', '#ff8243', 
      '#ff7028', '#EA5906', '#cc4905', '#b33d00', '#802b00' // Index 6 este #EA5906
    ],
    'terra-yellow': [
      '#fffce1', '#fff8cc', '#ffef9b', '#ffe664', '#ffde38', 
      '#ffd91c', '#FDC203', '#e3ac00', '#ca9800', '#b08400' // Index 6 este #FDC203
    ],
  },
  primaryColor: 'terra-blue',
  defaultRadius: 'xs', 
  fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
  headings: { fontFamily: 'Rajdhani, Roboto, sans-serif' },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);