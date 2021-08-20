import React, {useReducer} from 'react';
import {
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import base64 from 'react-native-base64';
import {BleManager} from 'react-native-ble-plx';

const bleManager = new BleManager();

const reducer = (state, action) => {
  switch (action.type) {
    case 'add':
      if (!state.devices.find(device => device.id === action.payload.id))
        return {...state, devices: [...state.devices, action.payload]};
      else return state;
    case 'connected':
      return {...state, connectedDevice: action.payload};
    case 'disconnect':
      return {...state, connectedDevice: null};
    case 'clear':
      return {...state, devices: []};
    default:
      return state;
  }
};

const App = () => {
  const [manager] = React.useState(bleManager);
  const [isConnected, setIsConnected] = React.useState(false);
  const [state, dispatch] = useReducer(reducer, {
    devices: [],
    connectedDevice: null,
  });
  const [incomingValue, setIncomingValue] = React.useState(null);

  React.useEffect(() => {
    if (incomingValue) {
      Alert.alert(incomingValue);
      setIncomingValue(null);
    }
  }, [incomingValue]);

  React.useEffect(() => {
    console.log(isConnected);
  }, [isConnected]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(async () => {
    if (isConnected && state.connectedDevice) {
      // const connectedDevices = await manager.isDeviceConnected(
      //   state.connectedDevice.id,
      // );
      // console.log(connectedDevices);
      manager.stopDeviceScan();
    }
  }, [isConnected, manager, state.connectedDevice]);

  React.useEffect(() => {
    const stateChangeSubscription = manager.onStateChange(state => {
      if (state === 'PoweredOn') {
        checkPermission();
        stateChangeSubscription.remove();
      }
    }, true);
  }, [manager, checkPermission]);

  const checkPermission = React.useCallback(async () => {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      const enabled = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );

      if (!enabled) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          // TODO: Show error message?
          return;
        }
      }
    }

    scan();
  }, [scan]);

  const scan = React.useCallback(() => {
    manager.startDeviceScan(null, null, async (error, scannedDevice) => {
      if (error) {
        console.log(error.androidErrorCode);
        console.log(error.attErrorCode);
        console.log(error.errorCode);
        console.log(error.message);
        console.log(error.reason);
        console.log(error.stack);
        // Handle error (scanning will be stopped automatically)
        return;
      }

      dispatch({type: 'add', payload: scannedDevice});

      // if (scannedDevice.name === 'BarCode Scanner BLE') {
      //   manager.stopDeviceScan();
      //   console.log('Connected device : ', scannedDevice.name);
      //   const isConnectedDevice = await scannedDevice.isConnected();
      //   if (isConnectedDevice) {
      //     scannedDevice.cancelConnection().then(d => {
      //       console.log(d.name);
      //       connect(d);
      //     });
      //   } else {
      //     connect(scannedDevice);
      //   }
      // }
    });
  }, [manager]);

  const disconnect = async device => {
    const isConnectedDevice = await device.isConnected();
    if (isConnectedDevice) {
      device.cancelConnection().then(d => {
        console.log(d.name);
        dispatch({type: 'disconnect'});
        checkPermission();
      });
    }
  };

  const connect = React.useCallback(
    scannedDevice => {
      scannedDevice
        .connect()
        .then(d => {
          return d.discoverAllServicesAndCharacteristics();
        })
        .then(async d => {
          setIsConnected(true);
          dispatch({type: 'connected', payload: d});
          const services = await d.services();
          services.forEach(async service => {
            const newCharacteristics = await service.characteristics();
            newCharacteristics.forEach(async characteristic => {
              if (characteristic.isReadable && characteristic.isNotifiable) {
                const subscription = characteristic.monitor((error, char) => {
                  if (error) {
                    subscription.remove();
                  } else {
                    console.log(base64.decode(char?.value));
                    setIncomingValue(base64.decode(char?.value));
                  }
                });
              }
            });
          });
        })
        .catch(error => {
          console.log(error);
          // Handle errors
        });
      const deviceDisconnectedSubscription = manager.onDeviceDisconnected(
        scannedDevice.id,
        (error, disconnectedDevice) => {
          console.log('Device disconnected!');
          setIsConnected(false);
          // checkPermission();
          dispatch({type: 'disconnect'});
          checkPermission();
          deviceDisconnectedSubscription.remove();
        },
      );
    },
    [checkPermission, manager],
  );

  return (
    <SafeAreaView style={styles.sectionContainer}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Bluetooth Test App</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => dispatch({type: 'clear'})}>
          <Text style={styles.buttonTitle}>clear</Text>
        </TouchableOpacity>
      </View>
      {state.connectedDevice && (
        <View style={styles.button}>
          <Text style={styles.buttonTitle}>
            {state.connectedDevice.id} - {state.connectedDevice.name} -{' '}
            {state.connectedDevice.localName}
          </Text>
          {state.connectedDevice.id === state.connectedDevice?.id && (
            <TouchableOpacity
              style={[styles.button, styles.connected]}
              onPress={() => disconnect(state.connectedDevice)}>
              <Text style={styles.buttonTitle}>disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <FlatList
        data={state.devices}
        keyExtractor={item => `${item.manufacturerData}${item.id}`}
        renderItem={({item}) => {
          return (
            <TouchableOpacity
              onPress={() => {
                console.log('connect clicked');
                connect(item);
              }}
              style={styles.button}>
              <Text style={styles.buttonTitle}>
                {item.id} - {item.name} - {item.localName}
              </Text>
              {item.id === state.connectedDevice?.id && (
                <TouchableOpacity
                  style={[styles.button, styles.connected]}
                  onPress={() => disconnect(item)}>
                  <Text style={styles.buttonTitle}>disconnect</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    marginVertical: 25,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  button: {
    backgroundColor: '#efefef',
    marginBottom: 15,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonTitle: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  header: {
    paddingHorizontal: '10%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  connected: {
    backgroundColor: 'rgba(255,100,100,.7)',
    marginBottom: 0,
  },
});

export default App;
