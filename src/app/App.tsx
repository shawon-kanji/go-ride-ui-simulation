import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { APIProvider } from '@vis.gl/react-google-maps';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';

import { LoginScreen } from '../features/auth/LoginScreen';
import { DriverLayout } from '../features/driver/DriverLayout';
import { HomeScreen as DriverHomeScreen } from '../features/driver/screens/HomeScreen';
import { MenuScreen as DriverMenuScreen } from '../features/driver/screens/MenuScreen';
import { OffersScreen } from '../features/driver/screens/OffersScreen';
import { TripAssignedScreen } from '../features/driver/screens/TripAssignedScreen';
import { SignupScreen } from '../features/auth/SignupScreen';
import type { Role } from '../shared/tab/types';
import { HealthPage } from './health/HealthPage';
import { HomePage } from './home/HomePage';
import { RedirectIfSession, RequireSession, RoleShell } from './RoleShell';
import { SignedInPlaceholder } from './SignedInPlaceholder';
import { SimulatorPage } from './simulator/SimulatorPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const signedInScreens: Record<Role, RouteObject[]> = {
  rider: [{ index: true, element: <SignedInPlaceholder role="rider" /> }],
  driver: [
    {
      element: <DriverLayout />,
      children: [
        { index: true, element: <DriverHomeScreen /> },
        { path: 'menu', element: <DriverMenuScreen /> },
        { path: 'offers', element: <OffersScreen /> },
        { path: 'trip', element: <TripAssignedScreen /> },
      ],
    },
  ],
};

function roleRoutes(role: Role, path: string): RouteObject {
  return {
    path,
    element: <RoleShell role={role} />,
    children: [
      {
        element: <RedirectIfSession role={role} />,
        children: [
          { path: 'login', element: <LoginScreen role={role} /> },
          { path: 'signup', element: <SignupScreen role={role} /> },
        ],
      },
      {
        element: <RequireSession role={role} />,
        children: [...signedInScreens[role], { path: '*', element: <Navigate to={`/${path}`} replace /> }],
      },
    ],
  };
}

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  roleRoutes('rider', 'user'),
  roleRoutes('driver', 'driver'),
  { path: '/simulator', element: <SimulatorPage /> },
  { path: '/health', element: <HealthPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Loads the Maps JS API once for every page that shows a map. */}
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''}>
        <RouterProvider router={router} />
      </APIProvider>
    </QueryClientProvider>
  );
}
