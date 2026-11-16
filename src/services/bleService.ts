export interface BLEAuthOptions {
  isGlobal?: boolean;
  floorId?: number | string;
}

export interface BLEConnection {
  token: string;
  writeToken: (newToken: string, durationMinutes: number) => Promise<void>;
  disconnect: () => void;
}

export const connectToESP32 = async (options?: BLEAuthOptions): Promise<BLEConnection> => {
  if (!(navigator as any).bluetooth) {
    throw new Error("Web Bluetooth API is not supported in this browser. Please use Chrome on a supported OS.<br/><br/>If you are using the IOS DEVICE than dolwoand <a href='https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055' target='_blank' style='color: #4da6ff; text-decoration: underline;'>BLUEFY</a> browser from AppStore.");
  }

  try {
    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

    console.log('Requesting Bluetooth Device...');
    let device;
    try {
      device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Hostel_Floor' },
          { namePrefix: 'Hostel_Global' },
          { namePrefix: 'Hostel_Aarti' },
          { namePrefix: 'Hostel_Sabha' },
          { namePrefix: 'Hostel_' },
          { namePrefix: 'ESP32' },
          { services: [SERVICE_UUID] }
        ],
        optionalServices: [SERVICE_UUID]
      });
    } catch (filterErr: any) {
      // If user cancelled, rethrow
      if (filterErr.name === 'NotFoundError' && filterErr.message.includes('User cancelled')) {
        throw filterErr;
      }
      // Otherwise fallback to acceptAllDevices
      device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });
    }

    console.log('Connecting to device...');
    let token = 'BEACON_ONLY';
    let writeToken = async (_newToken: string, _durationMinutes: number) => {};
    
    try {
      if (device.gatt) {
        console.log('Connecting to GATT Server...');
        const server = await device.gatt.connect();
        if (server) {
          console.log('Getting Service...');
          const service = await server.getPrimaryService(SERVICE_UUID);
          console.log('Getting Characteristic...');
          const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

          // 🤝 Send Floor ID or Global Session ID for ESP32 hardware matching
          if (options) {
            const encoder = new TextEncoder();
            let authCommand = '';
            if (options.isGlobal) {
              authCommand = 'AUTH:GLOBAL:HSH_GLOBAL';
              console.log('Sending Global Match Command to ESP32:', authCommand);
            } else if (options.floorId !== undefined && options.floorId !== null) {
              authCommand = `AUTH:FLOOR:${options.floorId}`;
              console.log(`Sending Floor Match Command (Floor ${options.floorId}) to ESP32:`, authCommand);
            }

            if (authCommand) {
              try {
                await characteristic.writeValue(encoder.encode(authCommand));
                // Allow ESP32 time to verify match and set characteristic response
                await new Promise(res => setTimeout(res, 80));
              } catch (writeErr: any) {
                console.warn('Could not write challenge command to ESP32:', writeErr.message);
              }
            }
          }

          console.log('Reading Value...');
          const value = await characteristic.readValue();
          const rawResponse = new TextDecoder().decode(value).replace(/\0/g, '').trim();
          console.log('ESP32 Characteristic Raw Response:', rawResponse);

          // Handle rejection or mismatch from ESP32
          if (rawResponse.startsWith('REJECT:FLOOR_MISMATCH')) {
            throw new Error(`Floor Mismatch: You are assigned to Floor ${options?.floorId}, but this ESP32 is registered to another floor. Please mark attendance on your own floor's beacon.`);
          } else if (rawResponse.startsWith('REJECT:')) {
            throw new Error(rawResponse.replace('REJECT:', '').trim());
          }

          // Extract token from successful handshake response or fallback
          if (rawResponse.startsWith('SUCCESS:FLOOR:')) {
            // Format: SUCCESS:FLOOR:<floor_id>:<token>
            const parts = rawResponse.split(':');
            token = parts.slice(3).join(':') || parts[3] || rawResponse;
          } else if (rawResponse.startsWith('SUCCESS:GLOBAL:')) {
            token = rawResponse.replace('SUCCESS:GLOBAL:', '').trim();
          } else {
            token = rawResponse || 'BEACON_ONLY';
          }
          
          writeToken = async (newToken: string, durationMinutes: number) => {
            const writeCommand = `SET:${newToken}:${durationMinutes}`;
            console.log('Writing to ESP32:', writeCommand);
            const encoder = new TextEncoder();
            await characteristic.writeValue(encoder.encode(writeCommand));
          };
        }
      }
    } catch (gattErr: any) {
      if (gattErr.message && (gattErr.message.includes('Floor Mismatch') || gattErr.message.includes('REJECT'))) {
        throw gattErr;
      }
      console.log('Beacon-only mode detected (No GATT service hosted):', gattErr.message);
      token = 'BEACON_ONLY';
    } finally {
      if (device.gatt?.connected) {
        console.log('Disconnecting from ESP32 immediately...');
        device.gatt.disconnect();
      }
    }

    const disconnect = () => {
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    };

    return { token, writeToken, disconnect };
  } catch (error: any) {
    console.error('BLE Error:', error);
    throw new Error(error.message || 'Failed to detect Bluetooth beacon.');
  }
};
