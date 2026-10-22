{
  "targets": [
    {
      "target_name": "neud_mac_output",
      "sources": ["mac-output.mm"],
      "include_dirs": [
        "<(module_root_dir)/../../node_modules/node-addon-api"
      ],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "GCC_ENABLE_CPP_RTTI": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CPLUSPLUSFLAGS": ["-fexceptions", "-frtti", "-std=c++17"]
      },
      "link_settings": {
        "libraries": ["-framework Cocoa"]
      }
    }
  ]
}
