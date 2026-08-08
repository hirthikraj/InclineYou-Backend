import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/main/HomeScreen';
import AddClientScreen from '../screens/main/AddClientScreen';
import ClientRosterScreen from '../screens/main/ClientRosterScreen';
import ClientDetailScreen from '../screens/main/ClientDetailScreen';
import EditClientScreen from '../screens/main/EditClientScreen';

export type MainStackParamList = {
  Home: undefined;
  Clients: undefined;
  AddClient: undefined;
  ClientDetail: { clientId: string };
  EditClient: { clientId: string };
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Clients" component={ClientRosterScreen} />
      <Stack.Screen name="AddClient" component={AddClientScreen} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
      <Stack.Screen name="EditClient" component={EditClientScreen} />
    </Stack.Navigator>
  );
}
