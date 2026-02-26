import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig, Provider, EnvironmentProviders } from '@angular/core';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = async (options?: { providers?: (Provider | EnvironmentProviders)[] }) => {

  const finalConfig = options 
    ? mergeApplicationConfig(config, { providers: options.providers || [] })
    : config;
    
  return bootstrapApplication(AppComponent, finalConfig);
};

export default bootstrap;
