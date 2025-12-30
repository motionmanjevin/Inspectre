import React from 'react';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  // Currently using dark theme (can be enhanced with theme toggle later)
  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}
