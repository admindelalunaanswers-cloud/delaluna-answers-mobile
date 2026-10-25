Pod::Spec.new do |s|
  s.name           = 'StatusBarStyle'
  s.version        = '1.0.0'
  s.summary        = 'Sets the iOS status bar style from the root view controller.'
  s.description    = 'Local module: view-controller-based status bar style for iOS 27, where the UIApplication API is a no-op.'
  s.license        = 'UNLICENSED'
  s.author         = 'Delaluna Answers'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
