import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../src/lib/store';
export default function Layout() {
  return <AppProvider><StatusBar style="dark"/><Stack screenOptions={{ headerShown:false, animation:'fade' }}/></AppProvider>;
}
