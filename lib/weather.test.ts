import { describe, expect, it } from "vitest"
import {
  buildEventWeather,
  compassLabel,
  describeWeatherCode,
  locationCandidates,
  nearbyWaterStations,
  parseWaterTemperatures,
} from "./weather"

describe("weather helpers", () => {
  it("translates WMO codes and wind directions to Hungarian", () => {
    expect(describeWeatherCode(2)).toBe("Részben felhős")
    expect(describeWeatherCode(95)).toBe("Zivatar")
    expect(compassLabel(315)).toBe("ÉNy")
    expect(compassLabel(359)).toBe("É")
    expect(compassLabel(-90)).toBe("Ny")
  })

  it("parses the HungaroMet water table, skipping missing values", () => {
    const html = "<tr><td>Balaton</td><td>Siófok</td><td>11</td></tr><tr><td>Balatonakali</td><td>-</td></tr><tr><td>Tihanyrév</td><td>12,5</td></tr>"
    const temperatures = parseWaterTemperatures(html)
    expect(temperatures.get("Siófok")).toBe(11)
    expect(temperatures.get("Tihanyrév")).toBe(12.5)
    expect(temperatures.has("Balatonakali")).toBe(false)
  })

  it("orders nearby lake stations by distance, none for far-away places", () => {
    expect(nearbyWaterStations({ latitude: 46.962, longitude: 17.872 }).map((station) => station.name).slice(0, 2)).toEqual(["Tihanyrév", "Balatonakali"])
    expect(nearbyWaterStations({ latitude: 47.498, longitude: 19.04 })).toEqual([])
  })

  it("tries the whole location and its parts", () => {
    expect(locationCandidates("BYC kikötő, Balatonfüred")).toEqual(["BYC kikötő, Balatonfüred", "BYC kikötő", "Balatonfüred", "BYC"])
    expect(locationCandidates("Szigliget kikötő")).toEqual(["Szigliget kikötő", "Szigliget"])
    expect(locationCandidates("  ")).toEqual([])
  })

  it("builds the weather for the requested day", () => {
    const weather = buildEventWeather(
      {
        time: ["2026-11-07"],
        weather_code: [2],
        temperature_2m_min: [7.6],
        temperature_2m_max: [13.4],
        wind_speed_10m_max: [11.6],
        wind_gusts_10m_max: [18.2],
        wind_direction_10m_dominant: [312],
      },
      "2026-11-07",
      { temperature: 11, station: "Siófok" },
    )
    expect(weather).toMatchObject({
      description: "Részben felhős",
      tempMin: 8,
      tempMax: 13,
      windKnots: 12,
      gustKnots: 18,
      windDirectionLabel: "ÉNy",
      water: { temperature: 11, station: "Siófok" },
    })
    expect(buildEventWeather({ time: [], weather_code: [], temperature_2m_min: [], temperature_2m_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [] }, "2026-11-07", null)).toBeNull()
  })
})
