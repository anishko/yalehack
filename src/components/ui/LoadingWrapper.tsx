'use client';
import { useState } from 'react';
import LoadingOverlay from './LoadingOverlay';

export default function LoadingWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LoadingOverlay />
      {children}
    </>
  );
}
