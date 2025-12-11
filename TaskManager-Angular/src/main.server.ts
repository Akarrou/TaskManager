import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = async (options?: any) => {

  const finalConfig = options 
    ? mergeApplicationConfig(config, { providers: options.providers || [] })
    : config;
    
  return bootstrapApplication(AppComponent, finalConfig);
};

export default bootstrap;
