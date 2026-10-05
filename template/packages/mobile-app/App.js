import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, Platform, BackHandler, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Network from 'expo-network';

export default function App() {
  const webviewRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const IS_UAT = Constants.expoConfig.extra?.env === 'uat';
  // Point to the correct web wrapper domain
  const BASE_URL = {{WEB_WRAPPER_URL_CODE}};

  useEffect(() => {
    checkNetwork();
    const backAction = () => {
      if (canGoBack && webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [canGoBack]);

  const checkNetwork = async () => {
    const networkState = await Network.getNetworkStateAsync();
    setIsConnected(networkState.isConnected);
  };

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.center}><ActivityIndicator size="large" color="#10b981" /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={IS_UAT ? 'light-content' : 'dark-content'} backgroundColor={IS_UAT ? '#ea580c' : '#ffffff'} />
      <WebView
        ref={webviewRef}
        source={{ uri: BASE_URL }}
        style={styles.webview}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        startInLoadingState={true}
        renderError={(errorDomain, errorCode, errorDesc) => (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#f9fafb', padding: 20 }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ef4444', marginBottom: 10 }}>Connection Error</Text>
            <Text style={{ textAlign: 'center', color: '#4b5563', marginBottom: 20 }}>
              We couldn't connect to the server. Please check your internet connection or DNS and try again.
            </Text>
            <TouchableOpacity onPress={() => webviewRef.current?.reload()} style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#10b981', borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry Connection</Text>
            </TouchableOpacity>
            <Text style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, marginTop: 20 }}>
              {errorDesc} (Code: {errorCode})
            </Text>
          </View>
        )}
        renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color="#10b981" /></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  webview: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
